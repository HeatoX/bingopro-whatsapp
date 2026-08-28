import { waClient } from './client';
import * as msg from './messages';
import { config } from '../config/env';
import { prisma, purchaseCard } from '../wallet/ledger';
import { renderCard } from '../game/card-renderer';
import { logger } from '../utils/logger';

export class CommandHandler {

    private extractPhone(jid: string): string {
        return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    }

    public async handleMessage(message: any): Promise<void> {
        const jid = message.key.remoteJid;
        const pushName = message.pushName || 'Jugador';

        if (!jid || jid.endsWith('@g.us')) return;

        const textContent =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            '';

        if (!textContent) return;

        const normalizedText = textContent.trim().toLowerCase();
        const textWithoutPrefix = normalizedText.startsWith('!')
            ? normalizedText.substring(1)
            : normalizedText;

        const args = textWithoutPrefix.split(' ').filter((a: string) => a.length > 0);
        if (args.length === 0) return;

        const command = args[0];

        try {
            switch (command) {
                case 'registro':
                case 'registrar':
                    await this.handleRegistro(jid, pushName);
                    break;
                case 'saldo':
                    await this.handleSaldo(jid);
                    break;
                case 'comprar': {
                    const count = parseInt(args[1]) || 1;
                    await this.handleComprar(jid, count, pushName);
                    break;
                }
                case 'cartones':
                    await this.handleCartones(jid, pushName);
                    break;
                case 'recargar': {
                    const amount = parseFloat(args[1]);
                    const ref = args[2];
                    if (isNaN(amount)) {
                        await waClient.sendText(jid, msg.depositInstructions({
                            banco: config.pagoMovilBanco,
                            telefono: config.pagoMovilTelefono,
                            cedula: config.pagoMovilCedula,
                        }));
                    } else if (!ref) {
                        await waClient.sendText(jid, msg.errorMessage('Debes incluir la referencia. Ej: !recargar 100 123456'));
                    } else {
                        await this.handleRecargar(jid, amount, ref);
                    }
                    break;
                }
                case 'retirar': {
                    const wAmt = parseFloat(args[1]);
                    if (isNaN(wAmt)) {
                        await waClient.sendText(jid, msg.errorMessage('Indica el monto. Ej: !retirar 100'));
                    } else {
                        await this.handleRetirar(jid, wAmt);
                    }
                    break;
                }
                case 'historial':
                    await this.handleHistorial(jid);
                    break;
                case 'reglas':
                    await waClient.sendText(jid, msg.rulesMessage());
                    break;
                case 'ayuda':
                case 'help':
                    await waClient.sendText(jid, msg.helpMessage());
                    break;
                case 'verificar':
                    await this.handleVerificar(jid, args[1]);
                    break;
                case 'jugar':
                case 'panel':
                case 'app': {
                    const phone = this.extractPhone(jid);
                    await waClient.sendText(
                        jid,
                        `🎰 *¡BIENVENIDO A BINGOPRO!* 🎲\n\n` +
                        `Entra a tu Panel de Juego interactivo con 1 solo toque:\n\n` +
                        `👉 ${config.appUrl}/player.html?phone=${phone}\n\n` +
                        `Ahí podrás ver tu saldo, comprar cartones con 1 clic y ver el sorteo en vivo.`
                    );
                    break;
                }
                default:
                    if (['hola', 'saludos', 'buenas', 'hi', 'hello'].includes(command)) {
                        const phone = this.extractPhone(jid);
                        await waClient.sendText(
                            jid,
                            msg.welcomeMessage(pushName) + `\n\n🎮 *Panel Web:* ${config.appUrl}/player.html?phone=${phone}`
                        );
                    }
                    break;
            }
        } catch (error: any) {
            logger.error(`[Handler] Error "${command}": ${error.message}`);
            await waClient.sendText(jid, msg.errorMessage('Ocurrió un error inesperado.'));
        }
    }

    /* ───────── helpers ───────── */

    private async getOrCreateUser(jid: string, name?: string) {
        const phone = this.extractPhone(jid);
        let user = await prisma.user.findUnique({ where: { phone } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    phone,
                    name: name || phone,
                    accounts: {
                        create: {
                            type: 'USER_REAL',
                            balance: { create: { availableBalance: 0, lockedBalance: 0 } },
                        },
                    },
                },
            });
            logger.info(`Nuevo usuario registrado: ${phone} (${name})`);
        }
        return user;
    }

    private async getUserBalance(userId: string): Promise<number> {
        const account = await prisma.account.findFirst({
            where: { userId, type: 'USER_REAL' },
            include: { balance: true },
        });
        return account?.balance?.availableBalance || 0;
    }

    /* ───────── comandos ───────── */

    private async handleRegistro(jid: string, name: string): Promise<void> {
        const phone = this.extractPhone(jid);
        const existing = await prisma.user.findUnique({ where: { phone } });

        if (existing) {
            await waClient.sendText(
                jid,
                `Ya estás registrado, *${existing.name || phone}*! 🎉\n\nUsa \`!saldo\` para ver tu balance o \`!ayuda\` para ver los comandos.`,
            );
            return;
        }

        const user = await this.getOrCreateUser(jid, name);
        await waClient.sendText(jid, msg.welcomeMessage(user.name || name));
    }

    private async handleSaldo(jid: string): Promise<void> {
        const user = await this.getOrCreateUser(jid);
        const balance = await this.getUserBalance(user.id);
        await waClient.sendText(jid, msg.balanceMessage(balance));
    }

    private async handleComprar(jid: string, count: number, pushName: string): Promise<void> {
        if (count < 1 || count > config.maxCardsPerPlayer) {
            await waClient.sendText(jid, msg.errorMessage(`Puedes comprar entre 1 y ${config.maxCardsPerPlayer} cartones.`));
            return;
        }

        const user = await this.getOrCreateUser(jid, pushName);
        const balance = await this.getUserBalance(user.id);
        const totalCost = count * config.cardPriceBs;

        if (balance < totalCost) {
            await waClient.sendText(jid, msg.insufficientFundsMessage(totalCost, balance));
            return;
        }

        const activeRound = await prisma.gameRound.findFirst({
            where: { status: { in: ['WAITING', 'SELLING'] } },
            orderBy: { createdAt: 'desc' },
        });

        if (!activeRound) {
            await waClient.sendText(jid, msg.errorMessage('No hay ronda activa. Espera al próximo anuncio.'));
            return;
        }
        if (activeRound.status !== 'SELLING') {
            await waClient.sendText(jid, msg.errorMessage('Las ventas aún no están abiertas. Espera el anuncio.'));
            return;
        }

        const existing = await prisma.card.count({
            where: { userId: user.id, gameRoundId: activeRound.id },
        });
        if (existing + count > config.maxCardsPerPlayer) {
            await waClient.sendText(jid, msg.errorMessage(`Ya tienes ${existing} cartón(es). Máximo: ${config.maxCardsPerPlayer}.`));
            return;
        }

        const purchased = [];
        try {
            for (let i = 0; i < count; i++) {
                const card = await purchaseCard(user.id, activeRound.id, existing + i + 1);
                purchased.push(card);
            }
        } catch (err: any) {
            if (err.message === 'INSUFFICIENT_FUNDS') {
                await waClient.sendText(jid, msg.insufficientFundsMessage(totalCost, balance));
            } else {
                await waClient.sendText(jid, msg.errorMessage(`Error: ${err.message}`));
            }
            return;
        }

        const newBal = await this.getUserBalance(user.id);
        await waClient.sendText(jid, msg.cardPurchaseConfirm(purchased.length, purchased.length * config.cardPriceBs, newBal));

        for (const card of purchased) {
            const grid = JSON.parse(card.grid) as (number | 0)[][];
            const buf = await renderCard(grid, new Set<number>(), card.hash.substring(0, 8).toUpperCase(), user.name || pushName);
            await waClient.sendImage(jid, buf, `🎟️ Cartón #${card.cardNumber} | Ronda #${activeRound.roundNumber}`);
        }
    }

    private async handleCartones(jid: string, pushName: string): Promise<void> {
        const user = await this.getOrCreateUser(jid, pushName);

        const activeRound = await prisma.gameRound.findFirst({
            where: { status: { in: ['WAITING', 'SELLING', 'DRAWING'] } },
            orderBy: { createdAt: 'desc' },
        });

        if (!activeRound) {
            await waClient.sendText(jid, 'No hay ronda activa. Espera al próximo anuncio.');
            return;
        }

        const cards = await prisma.card.findMany({
            where: { userId: user.id, gameRoundId: activeRound.id },
        });

        if (cards.length === 0) {
            await waClient.sendText(jid, '🎟️ No tienes cartones en esta ronda.\n\nUsa `!comprar [N]` para participar.');
            return;
        }

        const drawnBalls = await prisma.drawnBall.findMany({ where: { gameRoundId: activeRound.id } });
        const drawnNumbers = new Set(drawnBalls.map((b) => b.number));

        await waClient.sendText(jid, `📨 Enviando tus *${cards.length}* cartón(es) — Ronda #${activeRound.roundNumber}...`);

        for (const card of cards) {
            const grid = JSON.parse(card.grid) as (number | 0)[][];
            const buf = await renderCard(grid, drawnNumbers, card.hash.substring(0, 8).toUpperCase(), user.name || pushName);
            await waClient.sendImage(jid, buf, `🎟️ #${card.cardNumber} | ${drawnNumbers.size > 0 ? `${drawnNumbers.size} bolas` : 'Esperando sorteo'}`);
        }
    }

    private async handleRecargar(jid: string, amount: number, ref: string): Promise<void> {
        if (amount <= 0) {
            await waClient.sendText(jid, msg.errorMessage('El monto debe ser mayor a 0.'));
            return;
        }

        const user = await this.getOrCreateUser(jid);
        const phone = this.extractPhone(jid);

        const dup = await prisma.pagoMovilDeposit.findUnique({ where: { referenceCode: ref } });
        if (dup) {
            await waClient.sendText(jid, msg.errorMessage('Esa referencia ya fue registrada. Verifica e intenta de nuevo.'));
            return;
        }

        await prisma.pagoMovilDeposit.create({
            data: {
                userId: user.id,
                referenceCode: ref,
                amount,
                bankCode: config.pagoMovilBanco,
                phoneNumber: phone,
                status: 'PENDING',
            },
        });

        await waClient.sendText(
            jid,
            `✅ *Recarga Registrada*\n\n💰 Monto: *${amount.toFixed(2)} Bs*\n📝 Ref: *${ref}*\n\nSerá verificada por un administrador. Te notificaremos cuando esté lista.`,
        );
    }

    private async handleRetirar(jid: string, amount: number): Promise<void> {
        if (amount <= 0) {
            await waClient.sendText(jid, msg.errorMessage('El monto debe ser mayor a 0.'));
            return;
        }

        const user = await this.getOrCreateUser(jid);
        const userAccount = await prisma.account.findFirst({
            where: { userId: user.id, type: 'USER_REAL' },
            include: { balance: true }
        });

        if (!userAccount || !userAccount.balance || userAccount.balance.availableBalance < amount) {
            const currentBal = userAccount?.balance?.availableBalance || 0;
            await waClient.sendText(jid, msg.insufficientFundsMessage(amount, currentBal));
            return;
        }

        const phone = this.extractPhone(jid);

        // Atomic lock: decrement availableBalance, increment lockedBalance, create request
        await prisma.$transaction(async (tx) => {
            await tx.accountBalance.update({
                where: { accountId: userAccount.id },
                data: {
                    availableBalance: { decrement: amount },
                    lockedBalance: { increment: amount }
                }
            });

            await tx.withdrawalRequest.create({
                data: {
                    userId: user.id,
                    amount,
                    bankCode: '',
                    phoneNumber: phone,
                    cedulaNumber: '',
                    status: 'PENDING',
                },
            });
        });

        await waClient.sendText(jid, `✅ *Solicitud de Retiro Registrada*\n\n💸 Monto: *${amount.toFixed(2)} Bs*\n🔒 Saldo retenido temporalmente.\n\nUn administrador procesará tu pago móvil a la brevedad.`);
    }

    private async handleHistorial(jid: string): Promise<void> {
        const user = await this.getOrCreateUser(jid);
        const account = await prisma.account.findFirst({ where: { userId: user.id, type: 'USER_REAL' } });

        if (!account) {
            await waClient.sendText(jid, msg.historyMessage([]));
            return;
        }

        const entries = await prisma.ledgerEntry.findMany({
            where: { accountId: account.id },
            include: { transaction: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        const txs = entries.map((e) => ({
            date: e.createdAt.toLocaleString('es-VE'),
            type: e.transaction.type.replace(/_/g, ' '),
            amount: e.amount,
        }));

        await waClient.sendText(jid, msg.historyMessage(txs));
    }

    private async handleVerificar(jid: string, roundArg?: string): Promise<void> {
        let round;

        if (roundArg && !isNaN(parseInt(roundArg))) {
            round = await prisma.gameRound.findFirst({
                where: { roundNumber: parseInt(roundArg) },
                include: { drawnBalls: { orderBy: { sequence: 'asc' } }, _count: { select: { cards: true } } },
            });
        } else {
            round = await prisma.gameRound.findFirst({
                where: { status: 'FINISHED' },
                orderBy: { createdAt: 'desc' },
                include: { drawnBalls: { orderBy: { sequence: 'asc' } }, _count: { select: { cards: true } } },
            });
        }

        if (!round) {
            await waClient.sendText(jid, msg.errorMessage('No se encontró la ronda especificada.'));
            return;
        }

        const balls = round.drawnBalls.map((b) => `${b.column}-${b.number}`).join(', ');

        await waClient.sendText(
            jid,
            `🔍 *Verificación Ronda #${round.roundNumber}*\n\n` +
                `📊 Estado: *${round.status}*\n` +
                `🎟️ Cartones: *${round._count.cards}*\n` +
                `💰 Pote: *${Number(round.prizePool).toFixed(2)} Bs*\n` +
                `🔴 Bolas: *${round.drawnBalls.length}/75*\n\n` +
                `🔐 *Provably Fair*\n` +
                `Hash: \`${round.serverSeedHash.substring(0, 16)}...\`\n` +
                (round.status === 'FINISHED' ? `Seed: \`${round.serverSeed.substring(0, 16)}...\`\n` : '') +
                (round.clientSeed ? `Client: \`${round.clientSeed.substring(0, 16)}...\`\n` : '') +
                `\n📋 Secuencia: ${balls || 'N/A'}`,
        );
    }
}
