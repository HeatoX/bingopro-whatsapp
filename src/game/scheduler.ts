import { config } from '../config/env';
import { GameEngine } from './engine';
import { logger } from '../utils/logger';

export class GameScheduler {
  private gameEngine: GameEngine;
  private isRunning = false;
  private currentTimeout: NodeJS.Timeout | null = null;
  private currentDrawInterval: NodeJS.Timeout | null = null;

  constructor(gameEngine: GameEngine) {
    this.gameEngine = gameEngine;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('🎱 Game Scheduler starting (Local Mode)...');
    
    // Schedule first round after 5 seconds
    this.scheduleNextRound(5000);

    logger.info(`🎱 Game Scheduler active — rounds every ${config.gameIntervalMinutes} min`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.currentTimeout) clearTimeout(this.currentTimeout);
    if (this.currentDrawInterval) clearInterval(this.currentDrawInterval);
    logger.info('🎱 Game Scheduler stopped');
  }

  private scheduleNextRound(delayMs?: number): void {
    if (!this.isRunning) return;

    const delay = delayMs ?? config.gameIntervalMinutes * 60 * 1000;
    logger.info(`⏰ Next round scheduled in ${Math.round(delay / 1000)}s`);

    this.currentTimeout = setTimeout(async () => {
      await this.runRoundLifecycle();
    }, delay);
  }

  private async runRoundLifecycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // 1. Create Round
      const round = await this.gameEngine.createRound();
      logger.info(`🆕 Round #${round.roundNumber} created (${round.id})`);

      // 2. Start Selling
      await this.gameEngine.startSelling(round.id);
      logger.info(`🛒 Selling started for round ${round.id} (${config.sellingWindowSeconds}s)`);

      // Wait selling window
      await new Promise(r => setTimeout(r, config.sellingWindowSeconds * 1000));

      // 3. Close Selling
      const closedRound = await this.gameEngine.closeSelling(round.id);
      
      if (closedRound.totalCards < config.minPlayersToStart) {
        logger.warn(`Round ${round.id} cancelled — not enough players (${closedRound.totalCards} cards, min ${config.minPlayersToStart})`);
        await this.gameEngine.cancelRound(round.id);
        this.scheduleNextRound();
        return;
      }

      logger.info(`🔒 Selling closed for round ${round.id} — ${closedRound.totalCards} cards, pool: ${closedRound.prizePool} Bs`);

      // 4. Start Ball Drawing Loop
      await new Promise(r => setTimeout(r, 3000)); // 3s pause before first ball

      this.currentDrawInterval = setInterval(async () => {
        if (!this.isRunning) {
          if (this.currentDrawInterval) clearInterval(this.currentDrawInterval);
          return;
        }

        try {
          const result = await this.gameEngine.drawBall(round.id);

          if (!result) {
            // All balls drawn
            if (this.currentDrawInterval) clearInterval(this.currentDrawInterval);
            logger.info(`🏁 Round ${round.id} finished (all balls drawn)`);
            await this.gameEngine.finishRound(round.id);
            this.scheduleNextRound();
            return;
          }

          const { ball, winners, roundFinished } = result;
          logger.info(`🔴 Ball #${ball.number} (${ball.column}-${ball.number}) drawn — seq ${ball.sequence}/75`);

          if (winners) {
            for (const w of winners) {
              logger.info(`🏆 Winner! ${w.type} — User: ${w.userId}`);
            }
          }

          if (roundFinished) {
            if (this.currentDrawInterval) clearInterval(this.currentDrawInterval);
            logger.info(`🏁 Round ${round.id} complete — BINGO!`);
            await this.gameEngine.finishRound(round.id);
            this.scheduleNextRound();
          }
        } catch (err: any) {
          logger.error(`Error in draw interval: ${err.message}`);
          if (this.currentDrawInterval) clearInterval(this.currentDrawInterval);
          await this.gameEngine.finishRound(round.id);
          this.scheduleNextRound();
        }
      }, config.ballDrawIntervalSeconds * 1000);

    } catch (error: any) {
      logger.error(`Failed in round lifecycle: ${error.message}`);
      this.scheduleNextRound(30000);
    }
  }

  async pauseGame(): Promise<void> {
    logger.info('⏸️ Game scheduler paused');
  }

  async resumeGame(): Promise<void> {
    logger.info('▶️ Game scheduler resumed');
  }
}
