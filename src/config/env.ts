import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://bingopro:bingopro_secret_2024@localhost:5432/bingopro',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // WhatsApp
  waSessionName: process.env.WA_SESSION_NAME || 'BingoPro',

  // Game Settings
  gameIntervalMinutes: parseInt(process.env.GAME_INTERVAL_MINUTES || '3'),
  cardPriceBs: parseFloat(process.env.CARD_PRICE_BS || '100'),
  maxCardsPerPlayer: parseInt(process.env.MAX_CARDS_PER_PLAYER || '50'),
  ballDrawIntervalSeconds: parseInt(process.env.BALL_DRAW_INTERVAL_SECONDS || '4'),
  sellingWindowSeconds: parseInt(process.env.SELLING_WINDOW_SECONDS || '120'),
  minPlayersToStart: parseInt(process.env.MIN_PLAYERS_TO_START || '1'),

  // Prize Distribution (percentages: 9% 1-line, 14% 2-lines, 57% full-card, 5% next-round seed, 15% house)
  housePercentage: parseFloat(process.env.HOUSE_PERCENTAGE || '15'),
  prize1LinePercentage: parseFloat(process.env.PRIZE_1_LINE_PERCENTAGE || '9'),
  prize2LinesPercentage: parseFloat(process.env.PRIZE_2_LINES_PERCENTAGE || '14'),
  prizeFullCardPercentage: parseFloat(process.env.PRIZE_FULL_CARD_PERCENTAGE || '57'),
  reserveSeedPercentage: parseFloat(process.env.RESERVE_SEED_PERCENTAGE || '5'),

  // Admin
  adminPort: parseInt(process.env.ADMIN_PORT || '3000'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'Heatox.227',

  jwtSecret: process.env.JWT_SECRET || 'change-this-in-production',

  // App URL (used in WhatsApp messages for player links)
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  // Pago Móvil
  pagoMovilBanco: process.env.PAGO_MOVIL_BANCO || '0102',
  pagoMovilCedula: process.env.PAGO_MOVIL_CEDULA || 'V-12345678',
  pagoMovilTelefono: process.env.PAGO_MOVIL_TELEFONO || '0412-1234567',
} as const;

// Validate prize distribution sums to 100%
const totalPercentage = config.housePercentage + config.prize1LinePercentage + 
                        config.prize2LinesPercentage + config.prizeFullCardPercentage +
                        config.reserveSeedPercentage;
if (Math.abs(totalPercentage - 100) > 0.01) {
  throw new Error(`Prize distribution must sum to 100%. Current: ${totalPercentage}%`);
}
