import { EventEmitter } from 'events';
import { prisma } from '../wallet/ledger';
import { generateServerSeed, hashSeed } from '../utils/crypto';
import { generateBallSequence, getBallColumn } from './draw-engine';
import { checkOneLine, checkTwoLines, checkFullCard } from './win-checker';
import { distributePrizes } from '../wallet/payout';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface DrawResult {
  ball: { number: number; column: string; sequence: number };
  winners?: { type: string; userId: string; prize?: number }[];
  roundFinished: boolean;
}

export class GameEngine extends EventEmitter {
  async initialize() {
    for (const type of ['HOUSE_REVENUE', 'HOUSE_ESCROW', 'PAYMENT_GATEWAY'] as const) {
      const acc = await prisma.account.findFirst({ where: { type } });
      if (!acc) {
        await prisma.account.create({
          data: {
            type,
            balance: { create: { availableBalance: 0, lockedBalance: 0 } }
          }
        });
      }
    }
    logger.info('System accounts initialized');
  }

  async createRound() {
    const serverSeed = generateServerSeed();
    const serverSeedHash = hashSeed(serverSeed);

    const lastRound = await prisma.gameRound.findFirst({
      orderBy: { roundNumber: 'desc' }
    });
    const roundNumber = (lastRound?.roundNumber || 0) + 1;

    const round = await prisma.gameRound.create({
      data: {
        roundNumber,
        serverSeed,
        serverSeedHash,
        scheduledAt: new Date(Date.now() + config.gameIntervalMinutes * 60000),
      }
    });
    
    this.emit('roundCreated', round);
    return round;
  }


  async startSelling(roundId: string) {
    const round = await prisma.gameRound.update({
      where: { id: roundId },
      data: { status: 'SELLING', sellingStartedAt: new Date() }
    });
    this.emit('sellingStarted', round);
    return round;
  }

  async closeSelling(roundId: string) {
    const clientSeed = crypto.randomBytes(16).toString('hex');
    
    const cards = await prisma.card.findMany({ where: { gameRoundId: roundId } });
    const prizePool = cards.reduce((sum, card) => sum + card.purchasePrice, 0);

    const round = await prisma.gameRound.update({
      where: { id: roundId },
      data: { 
        status: 'DRAWING', 
        clientSeed,
        prizePool,
        totalCards: cards.length,
        drawingStartedAt: new Date()
      }
    });
    this.emit('sellingClosed', round);
    return round;
  }

  async cancelRound(roundId: string) {
    const cards = await prisma.card.findMany({ 
      where: { gameRoundId: roundId },
      include: { user: { include: { accounts: { include: { balance: true } } } } }
    });

    // Atomic refund: all-or-nothing with ledger entries
    await prisma.$transaction(async (tx) => {
      for (const card of cards) {
        const userAccount = card.user.accounts.find(a => a.type === 'USER_REAL');
        if (userAccount?.balance) {
          await tx.accountBalance.update({
            where: { accountId: userAccount.id },
            data: { availableBalance: { increment: card.purchasePrice } }
          });
          await tx.transaction.create({
            data: {
              idempotencyKey: `REFUND:${roundId}:${card.id}`,
              type: 'REFUND',
              gameRoundId: roundId,
              description: `Reembolso ronda cancelada`,
              metadata: JSON.stringify({ userId: card.userId, amount: card.purchasePrice }),
              ledgerEntries: { create: [{ accountId: userAccount.id, amount: card.purchasePrice }] }
            }
          });
        }
      }
      await tx.gameRound.update({
        where: { id: roundId },
        data: { status: 'CANCELLED', finishedAt: new Date() }
      });
    });

    logger.info(`Round ${roundId} cancelled and ${cards.length} cards refunded (atomic)`);
    this.emit('roundCancelled', { roundId, refundedCards: cards.length });
  }

  async drawBall(roundId: string): Promise<DrawResult | null> {
    const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!round || !round.clientSeed) throw new Error('Round not ready for drawing');

    const drawnSoFar = await prisma.drawnBall.count({ where: { gameRoundId: roundId } });
    if (drawnSoFar >= 75) {
      return null; // All balls drawn
    }

    const sequence = generateBallSequence(round.serverSeed, round.clientSeed);
    const nextBall = sequence[drawnSoFar];
    
    const drawnBall = await prisma.drawnBall.create({
      data: {
        gameRoundId: roundId,
        number: nextBall,
        sequence: drawnSoFar + 1,
        column: getBallColumn(nextBall)
      }
    });

    const ball = { number: drawnBall.number, column: drawnBall.column, sequence: drawnBall.sequence };
    this.emit('ballDrawn', { roundId, ball });

    // Check for winners
    const allDrawn = await prisma.drawnBall.findMany({ where: { gameRoundId: roundId } });
    const drawnNumbers = new Set(allDrawn.map(b => b.number));
    const winners: { type: string; userId: string }[] = [];
    let roundFinished = false;

    // Fetch ALL cards — a card that won 1-line must still compete for 2-lines and full card
    const cards = await prisma.card.findMany({ where: { gameRoundId: roundId } });
    
    const currentRound = await prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!currentRound) return null;

    for (const card of cards) {
      const grid = JSON.parse(card.grid) as (number | 0)[][];
      
      if (!currentRound.winner1LineUserId && checkOneLine(grid, drawnNumbers)) {
        await this.handleWin(roundId, '1LINE', card.userId, card.id);
        currentRound.winner1LineUserId = card.userId;
        winners.push({ type: '1LINE', userId: card.userId });
      }
      if (!currentRound.winner2LinesUserId && checkTwoLines(grid, drawnNumbers)) {
        await this.handleWin(roundId, '2LINES', card.userId, card.id);
        currentRound.winner2LinesUserId = card.userId;
        winners.push({ type: '2LINES', userId: card.userId });
      }
      if (!currentRound.winnerFullCardUserId && checkFullCard(grid, drawnNumbers)) {
        await this.handleWin(roundId, 'FULLCARD', card.userId, card.id);
        currentRound.winnerFullCardUserId = card.userId;
        winners.push({ type: 'FULLCARD', userId: card.userId });
        roundFinished = true;
        break;
      }
    }

    return {
      ball,
      winners: winners.length > 0 ? winners : undefined,
      roundFinished,
    };
  }

  async handleWin(roundId: string, type: '1LINE' | '2LINES' | 'FULLCARD', userId: string, cardId: string) {
    const updateData: Record<string, string> = {};
    if (type === '1LINE') updateData.winner1LineUserId = userId;
    if (type === '2LINES') updateData.winner2LinesUserId = userId;
    if (type === 'FULLCARD') updateData.winnerFullCardUserId = userId;

    const round = await prisma.gameRound.update({
      where: { id: roundId },
      data: updateData
    });
    
    await prisma.card.update({
      where: { id: cardId },
      data: { isWinner: true, winType: type }
    });

    const pool = Number(round.prizePool);
    let prizePercent = 0;
    if (type === '1LINE') prizePercent = config.prize1LinePercentage;
    if (type === '2LINES') prizePercent = config.prize2LinesPercentage;
    if (type === 'FULLCARD') prizePercent = config.prizeFullCardPercentage;
    const prize = (pool * prizePercent) / 100;

    this.emit('winner', { roundId, type, userId, cardId, prize, roundNumber: round.roundNumber });
  }

  async finishRound(roundId: string) {
    const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!round || round.status === 'FINISHED') return;

    await prisma.gameRound.update({
      where: { id: roundId },
      data: { status: 'FINISHED', finishedAt: new Date() }
    });

    await distributePrizes(roundId, round.prizePool, {
      line1: round.winner1LineUserId || undefined,
      line2: round.winner2LinesUserId || undefined,
      fullCard: round.winnerFullCardUserId || undefined,
    });

    const ballsDrawn = await prisma.drawnBall.count({ where: { gameRoundId: roundId } });

    this.emit('roundFinished', {
      roundId,
      roundNumber: round.roundNumber,
      totalCards: round.totalCards,
      prizePool: Number(round.prizePool),
      houseRake: Number(round.houseRake),
      ballsDrawn,
      winners: {
        line1: round.winner1LineUserId,
        line2: round.winner2LinesUserId,
        fullCard: round.winnerFullCardUserId,
      },
    });
  }

  async getRoundStatus(roundId: string) {
    return prisma.gameRound.findUnique({ 
      where: { id: roundId },
      include: { 
        drawnBalls: { orderBy: { sequence: 'asc' } },
        _count: { select: { cards: true } }
      }
    });
  }

  async getCurrentRound() {
    return prisma.gameRound.findFirst({
      where: { status: { in: ['WAITING', 'SELLING', 'DRAWING'] } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
