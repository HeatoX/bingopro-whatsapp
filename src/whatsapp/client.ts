import makeWASocket, { useMultiFileAuthState, DisconnectReason, WASocket } from 'baileys';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

export class WhatsAppClient {
    private static instance: WhatsAppClient;
    private socket: WASocket | null = null;
    private readonly sessionDir: string;
    private isConnected = false;
    private currentQR: string | null = null;

    private constructor() {
        this.sessionDir = path.join(process.cwd(), 'wa-session');
        if (!fs.existsSync(this.sessionDir)) fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    public static getInstance(): WhatsAppClient {
        if (!WhatsAppClient.instance) WhatsAppClient.instance = new WhatsAppClient();
        return WhatsAppClient.instance;
    }

    private messageCallbacks: Array<(message: any) => Promise<void>> = [];

    /* ─── Estado público ─── */

    public getConnectionStatus(): { connected: boolean; hasQR: boolean } {
        return { connected: this.isConnected, hasQR: !!this.currentQR };
    }

    public async getQRDataURL(): Promise<string | null> {
        if (!this.currentQR) return null;
        try {
            return await QRCode.toDataURL(this.currentQR, { width: 512, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
        } catch { return null; }
    }

    /* ─── Conexión ─── */

    public async connect(): Promise<void> {
        const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

        this.socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['BingoPro', 'Chrome', '1.0.0'],
        });

        this.socket.ev.on('creds.update', saveCreds);

        this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const m of messages) {
                if (!m.message || m.key.fromMe) continue;
                for (const cb of this.messageCallbacks) {
                    try { await cb(m); } catch (e: any) { logger.error(`Msg callback error: ${e.message}`); }
                }
            }
        });

        this.socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.currentQR = qr;
                try {
                    const qrDir = path.join(process.cwd(), 'web-dashboard');
                    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
                    await QRCode.toFile(path.join(qrDir, 'qr-code.png'), qr, { width: 512, margin: 2 });
                } catch (e: any) { logger.error(`QR save error: ${e.message}`); }
                logger.info(`📱 QR listo → http://localhost:${config.adminPort}/qr.html`);
            }

            if (connection === 'close') {
                this.isConnected = false;
                this.currentQR = null;
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                logger.warn(`WhatsApp desconectado: ${(lastDisconnect?.error as Boom)?.message || 'unknown'}`);
                if (shouldReconnect) {
                    logger.info('Reconectando en 5s...');
                    setTimeout(() => this.connect(), 5000);
                } else {
                    logger.error('Sesión cerrada permanentemente. Elimina wa-session/ y reinicia.');
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                this.currentQR = null;
                logger.info('✅ WhatsApp conectado exitosamente!');
            }
        });
    }

    public onMessage(callback: (message: any) => Promise<void>): void {
        this.messageCallbacks.push(callback);
    }

    /* ─── Envío de mensajes ─── */

    private async randomDelay(): Promise<void> {
        return new Promise((r) => setTimeout(r, Math.floor(Math.random() * 2000) + 1000));
    }

    public async sendText(jid: string, text: string): Promise<void> {
        if (!this.socket || !this.isConnected) {
            logger.warn(`[Offline] → ${jid}: ${text.substring(0, 60)}…`);
            return;
        }
        await this.randomDelay();
        await this.socket.sendMessage(jid, { text });
    }

    public async sendImage(jid: string, buffer: Buffer, caption?: string): Promise<void> {
        if (!this.socket || !this.isConnected) {
            logger.warn(`[Offline] Img → ${jid} (${buffer.length}b)`);
            return;
        }
        await this.randomDelay();
        await this.socket.sendMessage(jid, { image: buffer, caption });
    }

    public async sendButtons(jid: string, text: string, buttons: Array<{ buttonId: string; buttonText: { displayText: string }; type: number }>): Promise<void> {
        if (!this.socket || !this.isConnected) return;
        await this.randomDelay();
        const fallback = text + '\n\nOpciones:\n' + buttons.map((b) => `• ${b.buttonText.displayText} → "${b.buttonId}"`).join('\n');
        await this.socket.sendMessage(jid, { text: fallback });
    }

    public async getGroupMembers(groupJid: string): Promise<string[]> {
        if (!this.socket || !this.isConnected) throw new Error('WhatsApp not connected');
        const meta = await this.socket.groupMetadata(groupJid);
        return meta.participants.map((p) => p.id);
    }

    public async broadcastToGroup(groupJid: string, text: string): Promise<void> {
        await this.sendText(groupJid, text);
    }

    public async disconnect(): Promise<void> {
        if (this.socket) { this.socket.end(undefined); this.isConnected = false; }
    }
}

export const waClient = WhatsAppClient.getInstance();
