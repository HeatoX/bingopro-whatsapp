import { config } from '../config/env';
import { GameEngine } from './engine';
import { logger } from '../utils/logger';
import { getSystemSettings } from '../config/settings';

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

    logger.info('🎱 Game Scheduler starting (Continuous Live Mode)...');
    
    // Start first round immediately after 3 seconds
    this.scheduleNextRound(3000);

    logger.info(`🎱 Game Scheduler active — continuous rounds with dynamic selling window`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.currentTimeout) clearTimeout(this.currentTimeout);
    logger.info('🎱 Game Scheduler stopped');
  }

  private scheduleNextRound(delayMs: number = 3000): void {
    if (!this.isRunning) return;

    const delay = Math.max(1000, delayMs);
    GameScheduler.nextRoundAt = new Date(Date.now() + delay);
    logger.info(`⏰ Next round opening in ${Math.round(delay / 1000)}s`);

    this.currentTimeout = setTimeout(async () => {
      await this.runRoundLifecycle();
    }, delay);
  }

  private async runRoundLifecycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const settings = getSystemSettings();
      const sellingWindow = settings.sellingWindowSeconds || 120;
      const ballInterval = settings.ballDrawIntervalSeconds || 4;
      const minPlayers = settings.minPlayersToStart || 1;

      // 1. Create Round
      const round = await this.gameEngine.createRound();
      logger.info(`🆕 Round #${round.roundNumber} created (${round.id})`);

      // 2. Start Selling immediately
      await this.gameEngine.startSelling(round.id);
      GameScheduler.nextRoundAt = new Date(Date.now() + sellingWindow * 1000);
      logger.info(`🛒 Selling started for round #${round.roundNumber} (${sellingWindow}s window)`);

      // Wait selling window
      await new Promise(r => setTimeout(r, sellingWindow * 1000));

      // 3. Close Selling
      const closedRound = await this.gameEngine.closeSelling(round.id);
      
      if (closedRound.totalCards < minPlayers) {
        logger.warn(`Round #${round.roundNumber} cancelled — not enough cards (${closedRound.totalCards} cards, min ${minPlayers})`);
        await this.gameEngine.cancelRound(round.id);
        this.scheduleNextRound(5000); // 5s before reopening next round
        return;
      }

      logger.info(`🔒 Selling closed for round #${round.roundNumber} — ${closedRound.totalCards} cards, pool: ${closedRound.prizePool} Bs`);

      // 4. Start Ball Drawing Loop (Sequential Loop - No setInterval Race Conditions)
      GameScheduler.nextRoundAt = new Date(Date.now() + 240000);

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
          logger.info(`🏁 Round #${round.roundNumber} finished (all 75 balls drawn)`);
          await this.gameEngine.finishRound(round.id);
          // Wait 8 seconds celebration then open next round immediately
          await new Promise(r => setTimeout(r, 8000));
          this.scheduleNextRound(2000);
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
          logger.info(`🏁 Round #${round.roundNumber} complete — BINGO!`);
          await this.gameEngine.finishRound(round.id);
          // Wait 10 seconds so all players can celebrate and see the winning spotlight card
          await new Promise(r => setTimeout(r, 10000));
          // Open next round immediately (2s intermission)
          this.scheduleNextRound(2000);
          return;
        }

        // Wait interval before next ball
        await new Promise(r => setTimeout(r, ballInterval * 1000));
      }

    } catch (error: any) {
      logger.error(`Failed in round lifecycle: ${error.message}`);
      this.scheduleNextRound(5000);
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
