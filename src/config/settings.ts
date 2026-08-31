import { prisma } from '../wallet/ledger';
import { config } from './env';
import { logger } from '../utils/logger';

export interface RoomConfig {
  id: string;
  name: string;
  badge: string;
  icon: string;
  cardPriceBs: number;
  themeColor: string;
  description: string;
  minPlayers: number;
  isActive: boolean;
}

export interface AppSettings {
  // Room Card Prices
  roomBroncePriceBs: number;
  roomClasicaPriceBs: number;
  roomOroPriceBs: number;
  roomDiamantePriceBs: number;

  // Prize Distribution (%)
  housePercentage: number;
  prize1LinePercentage: number;
  prize2LinesPercentage: number;
  prizeFullCardPercentage: number;
  reserveSeedPercentage: number;

  // Timers & Game Flow
  gameIntervalMinutes: number;
  sellingWindowSeconds: number;
  ballDrawIntervalSeconds: number;
  minPlayersToStart: number;
  maxCardsPerPlayer: number;

  // Pago Móvil Oficial
  pagoMovilBanco: string;
  pagoMovilCedula: string;
  pagoMovilTelefono: string;
}

// In-memory cached settings with env defaults
let cachedSettings: AppSettings = {
  roomBroncePriceBs: 50,
  roomClasicaPriceBs: config.cardPriceBs || 100,
  roomOroPriceBs: 250,
  roomDiamantePriceBs: 500,

  housePercentage: config.housePercentage || 20,
  prize1LinePercentage: config.prize1LinePercentage || 10,
  prize2LinesPercentage: config.prize2LinesPercentage || 15,
  prizeFullCardPercentage: config.prizeFullCardPercentage || 50,
  reserveSeedPercentage: config.reserveSeedPercentage || 5,

  gameIntervalMinutes: config.gameIntervalMinutes || 3,
  sellingWindowSeconds: config.sellingWindowSeconds || 120,
  ballDrawIntervalSeconds: config.ballDrawIntervalSeconds || 4,
  minPlayersToStart: config.minPlayersToStart || 5,
  maxCardsPerPlayer: config.maxCardsPerPlayer || 50,

  pagoMovilBanco: config.pagoMovilBanco || '0102',
  pagoMovilCedula: config.pagoMovilCedula || 'V-12345678',
  pagoMovilTelefono: config.pagoMovilTelefono || '0412-1234567',
};

// Load settings from database on startup
export async function loadSystemSettings(): Promise<AppSettings> {
  try {
    const records = await prisma.systemSetting.findMany();
    for (const r of records) {
      if (r.key in cachedSettings) {
        const val = JSON.parse(r.value);
        (cachedSettings as any)[r.key] = val;
      }
    }
    logger.info('⚙️ System settings loaded from database');
  } catch (err: any) {
    logger.warn(`Could not load settings from DB, using defaults: ${err.message}`);
  }
  return cachedSettings;
}

export function getSystemSettings(): AppSettings {
  return { ...cachedSettings };
}

export async function updateSystemSettings(newSettings: Partial<AppSettings>): Promise<{ success: boolean; settings: AppSettings; error?: string }> {
  // 1. Validate prize percentages sum to 100%
  const house = newSettings.housePercentage !== undefined ? Number(newSettings.housePercentage) : cachedSettings.housePercentage;
  const line1 = newSettings.prize1LinePercentage !== undefined ? Number(newSettings.prize1LinePercentage) : cachedSettings.prize1LinePercentage;
  const line2 = newSettings.prize2LinesPercentage !== undefined ? Number(newSettings.prize2LinesPercentage) : cachedSettings.prize2LinesPercentage;
  const full = newSettings.prizeFullCardPercentage !== undefined ? Number(newSettings.prizeFullCardPercentage) : cachedSettings.prizeFullCardPercentage;
  const seed = newSettings.reserveSeedPercentage !== undefined ? Number(newSettings.reserveSeedPercentage) : cachedSettings.reserveSeedPercentage;

  const total = house + line1 + line2 + full + seed;
  if (Math.abs(total - 100) > 0.01) {
    return {
      success: false,
      settings: cachedSettings,
      error: `La suma de los porcentajes de premios debe ser exactamente 100%. Suma actual: ${total.toFixed(1)}%`
    };
  }

  // 2. Update cached object
  cachedSettings = {
    ...cachedSettings,
    ...newSettings
  };

  // 3. Persist each modified setting in database
  try {
    for (const [key, value] of Object.entries(cachedSettings)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) }
      });
    }
    logger.info('💾 System settings updated and persisted to database');
    return { success: true, settings: cachedSettings };
  } catch (err: any) {
    logger.error(`Error saving settings to DB: ${err.message}`);
    return { success: false, settings: cachedSettings, error: err.message };
  }
}

// Get configured rooms for the lobby
export function getRoomList(): RoomConfig[] {
  const s = cachedSettings;
  return [
    {
      id: 'sala-50',
      name: 'SALA BRONCE',
      badge: '🥉 POPULAR',
      icon: '🥉',
      cardPriceBs: s.roomBroncePriceBs,
      themeColor: '#CD7F32',
      description: 'Partidas dinámicas y accesibles para todos los jugadores.',
      minPlayers: 1,
      isActive: true
    },
    {
      id: 'sala-100',
      name: 'SALA CLÁSICA ROYALE',
      badge: '🔴 EN VIVO',
      icon: '👑',
      cardPriceBs: s.roomClasicaPriceBs,
      themeColor: '#FFD700',
      description: 'Nuestra sala principal oficial de 75 bolas con sorteo certificado.',
      minPlayers: 1,
      isActive: true
    },
    {
      id: 'sala-250',
      name: 'SALA ORO VIP',
      badge: '🥇 VIP ALTO',
      icon: '🥇',
      cardPriceBs: s.roomOroPriceBs,
      themeColor: '#FFA500',
      description: 'Grandes premios acumulados para jugadores exclusivos.',
      minPlayers: 1,
      isActive: true
    },
    {
      id: 'sala-500',
      name: 'SALA DIAMANTE ROYALE',
      badge: '💎 HIGH ROLLER',
      icon: '💎',
      cardPriceBs: s.roomDiamantePriceBs,
      themeColor: '#00E5FF',
      description: 'La máxima categoría de apuestas con pozos astronómicos.',
      minPlayers: 1,
      isActive: true
    }
  ];
}
