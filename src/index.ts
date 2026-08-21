import { config } from './config/env';
import { logger } from './utils/logger';
import { GameEngine } from './game/engine';
import { GameScheduler } from './game/scheduler';
import { WhatsAppClient } from './whatsapp/client';
import { CommandHandler } from './whatsapp/handlers';
import { createAdminServer } from './admin/server';
import * as messages from './whatsapp/messages';
import { renderCard } from './game/card-renderer';
import { prisma } from './wallet/ledger';

// ============================================
// 🎱 BINGOPRO — ENTRY POINT
// ============================================

async function main() {
  logger.info('═══════════════════════════════════════════');
  logger.info('  🎱 BINGOPRO — Sistema de Bingo Profesional');
  logger.info('═══════════════════════════════════════════');
  logger.info(`  💰 Cartón: ${config.cardPriceBs} Bs`);
  logger.info(`  🏠 Casa: ${config.housePercentage}%`);
  logger.info(`  🏆 1 Línea: ${config.prize1LinePercentage}%`);
  logger.info(`  🏆🏆 2 Líneas: ${config.prize2LinesPercentage}%`);
  logger.info(`  👑 Bingo: ${config.prizeFullCardPercentage}%`);
  logger.info(`  ⏰ Rondas cada: ${config.gameIntervalMinutes} min`);
  logger.info(`  🃏 Máx cartones/jugador: ${config.maxCardsPerPlayer}`);
  logger.info('═══════════════════════════════════════════');

  // ---- 1. Initialize Game Engine ----
  const gameEngine = new GameEngine();
  await gameEngine.initialize();
  logger.info('✅ Game Engine initialized');

  // ---- 2. Initialize Game Scheduler ----
  const scheduler = new GameScheduler(gameEngine);
  await scheduler.start();
  logger.info('✅ Game Scheduler started');

  // ---- 3. Initialize Admin Dashboard ----
  const adminServer = createAdminServer(gameEngine, scheduler);
  adminServer.listen(config.adminPort, () => {
    logger.info(`✅ Admin Dashboard running on http://localhost:${config.adminPort}`);
  });

  // ---- 4. Initialize WhatsApp Client ----
  const waClient = WhatsAppClient.getInstance();
  const commandHandler = new CommandHandler();

  // Wire game events to WhatsApp broadcasts
  wireGameEventsToWhatsApp(gameEngine, waClient);

  // Register message handler
  waClient.onMessage(async (msg: any) => {
    try {
      await commandHandler.handleMessage(msg);
    } catch (error: any) {
      logger.error(`Error handling message: ${error.message}`);
    }
  });

  await waClient.connect();
  logger.info('✅ WhatsApp Client connecting...');

  // ---- Graceful Shutdown ----
  const shutdown = async (signal: string) => {
    logger.info(`\n🛑 ${signal} received — shutting down gracefully...`);
    await scheduler.stop();
    await waClient.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info('');
  logger.info('🎱 BingoPro está ACTIVO y listo para jugar!');
  logger.info('📱 Escanea el QR de WhatsApp para comenzar');
  logger.info('🖥️  Panel Admin: http://localhost:' + config.adminPort);
  logger.info('');
}

// ============================================
// Wire Game Engine events → WhatsApp messages
// ============================================

function wireGameEventsToWhatsApp(engine: GameEngine, wa: WhatsAppClient) {
  const broadcastGroup = process.env.WA_GROUP_JID;

  const broadcast = async (text: string) => {
    if (broadcastGroup) {
      await wa.broadcastToGroup(broadcastGroup, text);
    }
  };

  engine.on('roundCreated', async (data: any) => {
    const msg = messages.roundAnnouncement(
      data.roundNumber,
      config.sellingWindowSeconds,
      0
    );
    await broadcast(msg);
  });

  engine.on('sellingStarted', async (data: any) => {
    const msg = messages.sellingOpenMessage(
      data.roundNumber,
      data.prizePool || 0
    );
    await broadcast(msg);
  });

  engine.on('sellingClosed', async (data: any) => {
    const msg = messages.sellingClosedMessage(
      data.roundNumber,
      data.totalCards,
      data.prizePool
    );
    await broadcast(msg);
  });

  engine.on('ballDrawn', async (data: any) => {
    const msg = messages.ballDrawnMessage(
      data.ball.number,
      data.ball.column,
      data.ball.sequence,
      75
    );
    await broadcast(msg);
  });

  engine.on('winner', async (data: any) => {
    const typeLabels: Record<string, string> = {
      '1LINE': '1 LÍNEA',
      '2LINES': '2 LÍNEAS',
      'FULLCARD': 'BINGO COMPLETO',
    };

    // Look up winner name
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    const winnerName = user?.name || user?.phone || 'Jugador';

    const winType = (['1LINE', '2LINES', 'FULLCARD'].includes(data.type) ? data.type : 'FULLCARD') as '1LINE' | '2LINES' | 'FULLCARD';
    const msg = messages.winnerMessage(
      winType,
      winnerName,
      data.prize || 0,
      data.roundNumber
    );
    await broadcast(msg);

    // Send personal congratulation to winner
    if (user?.phone) {
      const personalMsg = `🎉🎉🎉\n\n*¡FELICIDADES ${winnerName}!*\n\n` +
        `Has ganado *${typeLabels[data.type]}* en la ronda #${data.roundNumber}\n\n` +
        `💰 *Premio: ${(data.prize || 0).toFixed(2)} Bs*\n` +
        `El dinero ya fue acreditado a tu billetera.\n\n` +
        `Escribe *!saldo* para ver tu balance actualizado.`;
      await wa.sendText(user.phone + '@s.whatsapp.net', personalMsg);
    }
  });

  engine.on('roundFinished', async (data: any) => {
    const msg = messages.roundFinishedMessage(data.roundNumber, {
      totalCards: data.totalCards,
      prizePool: data.prizePool,
      houseRake: data.houseRake,
      winners: data.winners,
      ballsDrawn: data.ballsDrawn,
    });
    await broadcast(msg);
  });
}


// ---- Launch ----
main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`, { stack: error.stack });
  process.exit(1);
});
