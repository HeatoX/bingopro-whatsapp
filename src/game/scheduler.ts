import { config } from '../config/env';
import { GameEngine } from './engine';
import { logger } from '../utils/logger';

export class GameScheduler {
  public static nextRoundAt: Date | null = null;
  private gameEngine: GameEngine;
  private isRunning = false;
  private isPaused = false;
  private currentTimeout: NodeJS.Timeout | null = null;

  constructor(gameEngine: GameEngine) {
    this.gameEngine = gameEngine;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    logger.info('🎱 Game Scheduler starting (Local Mode)...');
    
    // Schedule first round after 5 seconds
    this.scheduleNextRound(5000);

    logger.info(`🎱 Game Scheduler active — rounds every ${config.gameIntervalMinutes} min`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.currentTimeout) clearTimeout(this.currentTimeout);
    logger.info('🎱 Game Scheduler stopped');
  }

  private scheduleNextRound(delayMs?: number): void {
    if (!this.isRunning) return;

    const delay = delayMs ?? config.gameIntervalMinutes * 60 * 1000;
    GameScheduler.nextRoundAt = new Date(Date.now() + delay);
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

      // 4. Start Ball Drawing Loop (Sequential Loop - No setInterval Race Conditions)
      await new Promise(r => setTimeout(r, 3000)); // 3s pause before first ball

      while (this.isRunning) {
        // Pause check
        while (this.isPaused && this.isRunning) {
          await new Promise(r => setTimeout(r, 1000));
        }

        if (!this.isRunning) break;

        const result = await this.gameEngine.drawBall(round.id);

        if (!result) {
          // All balls drawn
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
          logger.info(`🏁 Round ${round.id} complete — BINGO!`);
          await this.gameEngine.finishRound(round.id);
          this.scheduleNextRound();
          return;
        }

        // Wait interval before next ball
        await new Promise(r => setTimeout(r, config.ballDrawIntervalSeconds * 1000));
      }

    } catch (error: any) {
      logger.error(`Failed in round lifecycle: ${error.message}`);
      this.scheduleNextRound(30000);
    }
  }

  async pauseGame(): Promise<void> {
    this.isPaused = true;
    logger.info('⏸️ Game scheduler paused');
  }

  async resumeGame(): Promise<void> {
    this.isPaused = false;
    logger.info('▶️ Game scheduler resumed');
  }
}
