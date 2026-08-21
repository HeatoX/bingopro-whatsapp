import { prisma } from './ledger';
import { config } from '../config/env';
import { generateIdempotencyKey } from '../utils/crypto';
import { logger } from '../utils/logger';

export async function distributePrizes(
  gameRoundId: string,
  totalPool: number,
  winners: { line1?: string; line2?: string; fullCard?: string }
) {
  const escrowAccount = await prisma.account.findFirst({ where: { type: 'HOUSE_ESCROW' } });
  const houseRevenueAccount = await prisma.account.findFirst({ where: { type: 'HOUSE_REVENUE' } });

  if (!escrowAccount || !houseRevenueAccount) {
    throw new Error('System accounts not initialized for payout');
  }

  // Calculate allocations
  const houseAmount = (totalPool * config.housePercentage) / 100;
  let line1Amount = (totalPool * config.prize1LinePercentage) / 100;
  let line2Amount = (totalPool * config.prize2LinesPercentage) / 100;
  let fullCardAmount = (totalPool * config.prizeFullCardPercentage) / 100;

  // Unclaimed prize roll-over logic
  if (!winners.line1) {
    fullCardAmount += line1Amount;
    line1Amount = 0;
  }
  if (!winners.line2) {
    fullCardAmount += line2Amount;
    line2Amount = 0;
  }

  const idempotencyKey = generateIdempotencyKey('PAYOUT', gameRoundId);
  const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
  if (existing) return;

  // Update GameRound recorded amounts
  await prisma.gameRound.update({
    where: { id: gameRoundId },
    data: {
      houseRake: houseAmount,
      prize1LineAmount: line1Amount,
      prize2LinesAmount: line2Amount,
      prizeFullCardAmount: fullCardAmount,
    }
  });

  // Credit House
  await prisma.accountBalance.update({
    where: { accountId: houseRevenueAccount.id },
    data: { availableBalance: { increment: houseAmount } }
  });

  // Payout 1-line winner
  if (winners.line1 && line1Amount > 0) {
    await creditWinner(winners.line1, line1Amount, 'WIN_PAYOUT_1LINE', gameRoundId);
  }

  // Payout 2-lines winner
  if (winners.line2 && line2Amount > 0) {
    await creditWinner(winners.line2, line2Amount, 'WIN_PAYOUT_2LINES', gameRoundId);
  }

  // Payout full-card winner
  if (winners.fullCard && fullCardAmount > 0) {
    await creditWinner(winners.fullCard, fullCardAmount, 'WIN_PAYOUT_FULLCARD', gameRoundId);
  }

  logger.info(`Prizes distributed for round ${gameRoundId}: House=${houseAmount}Bs, FullCard=${fullCardAmount}Bs`);
}

async function creditWinner(userId: string, amount: number, txType: string, gameRoundId: string) {
  const userAccount = await prisma.account.findFirst({
    where: { userId, type: 'USER_REAL' }
  });
  if (!userAccount) return;

  await prisma.accountBalance.update({
    where: { accountId: userAccount.id },
    data: { availableBalance: { increment: amount } }
  });

  await prisma.transaction.create({
    data: {
      idempotencyKey: generateIdempotencyKey(txType, gameRoundId, userId),
      type: txType,
      gameRoundId,
      metadata: JSON.stringify({ userId, amount }),
      ledgerEntries: {
        create: [
          { accountId: userAccount.id, amount }
        ]
      }
    }
  });
}
