import { prisma } from './ledger';
import { config } from '../config/env';
import { getSystemSettings } from '../config/settings';
import { generateIdempotencyKey } from '../utils/crypto';
import { logger } from '../utils/logger';

export async function distributePrizes(
  gameRoundId: string,
  totalPool: number,
  winners: { line1?: string; line2?: string; fullCard?: string }
) {
  const escrowAccount = await prisma.account.findFirst({
    where: { type: 'HOUSE_ESCROW' },
    include: { balance: true }
  });
  const houseRevenueAccount = await prisma.account.findFirst({
    where: { type: 'HOUSE_REVENUE' },
    include: { balance: true }
  });
  const houseJackpotAccount = await prisma.account.findFirst({
    where: { type: 'HOUSE_JACKPOT' },
    include: { balance: true }
  });

  if (!escrowAccount || !houseRevenueAccount) {
    throw new Error('System accounts not initialized for payout');
  }

  const s = getSystemSettings();

  // Calculate allocations using dynamic settings
  const houseAmount = (totalPool * s.housePercentage) / 100;
  const reserveSeedAmount = (totalPool * s.reserveSeedPercentage) / 100;
  let line1Amount = (totalPool * s.prize1LinePercentage) / 100;
  let line2Amount = (totalPool * s.prize2LinesPercentage) / 100;
  let fullCardAmount = (totalPool * s.prizeFullCardPercentage) / 100;

  // Unclaimed prize roll-over logic into Full Card
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
  if (existing) {
    logger.warn(`Payout for round ${gameRoundId} already executed (idempotency key matched)`);
    return;
  }

  // Execute entire prize distribution in a single atomic transaction
  await prisma.$transaction(async (tx) => {
    // 1. Create master payout transaction to seal idempotency
    await tx.transaction.create({
      data: {
        idempotencyKey,
        type: 'PAYOUT_MASTER',
        gameRoundId,
        description: `Distribución de premios ronda ${gameRoundId}`,
        metadata: JSON.stringify({ totalPool, houseAmount, reserveSeedAmount, line1Amount, line2Amount, fullCardAmount, winners }),
      }
    });

    // 2. Update GameRound recorded amounts
    await tx.gameRound.update({
      where: { id: gameRoundId },
      data: {
        houseRake: houseAmount,
        prize1LineAmount: line1Amount,
        prize2LinesAmount: line2Amount,
        prizeFullCardAmount: fullCardAmount,
      }
    });

    // 3. Process House Rake (Escrow -> House Revenue)
    if (houseAmount > 0) {
      await tx.accountBalance.update({
        where: { accountId: escrowAccount.id },
        data: { availableBalance: { decrement: houseAmount } }
      });
      await tx.accountBalance.update({
        where: { accountId: houseRevenueAccount.id },
        data: { availableBalance: { increment: houseAmount } }
      });
      await tx.transaction.create({
        data: {
          idempotencyKey: generateIdempotencyKey('HOUSE_RAKE', gameRoundId),
          type: 'HOUSE_RAKE',
          gameRoundId,
          description: `Comisión de la casa (${config.housePercentage}%)`,
          metadata: JSON.stringify({ amount: houseAmount }),
          ledgerEntries: {
            create: [
              { accountId: escrowAccount.id, amount: -houseAmount },
              { accountId: houseRevenueAccount.id, amount: houseAmount }
            ]
          }
        }
      });
    }

    // 3.1 Process 5% Reserve Seed Accumulator for Next Bingo Round (Escrow -> House Jackpot)
    if (reserveSeedAmount > 0 && houseJackpotAccount) {
      await tx.accountBalance.update({
        where: { accountId: escrowAccount.id },
        data: { availableBalance: { decrement: reserveSeedAmount } }
      });
      await tx.accountBalance.update({
        where: { accountId: houseJackpotAccount.id },
        data: { availableBalance: { increment: reserveSeedAmount } }
      });
      await tx.transaction.create({
        data: {
          idempotencyKey: generateIdempotencyKey('RESERVE_SEED', gameRoundId),
          type: 'RESERVE_SEED_ACCUMULATOR',
          gameRoundId,
          description: `Pozo Acumulado Próxima Ronda (${config.reserveSeedPercentage}%)`,
          metadata: JSON.stringify({ amount: reserveSeedAmount }),
          ledgerEntries: {
            create: [
              { accountId: escrowAccount.id, amount: -reserveSeedAmount },
              { accountId: houseJackpotAccount.id, amount: reserveSeedAmount }
            ]
          }
        }
      });
    }

    // Helper for winner credit inside transaction
    const payWinner = async (userId: string, amount: number, txType: string) => {
      const userAccount = await tx.account.findFirst({
        where: { userId, type: 'USER_REAL' }
      });
      if (!userAccount) return;

      // Decrement Escrow, Increment User
      await tx.accountBalance.update({
        where: { accountId: escrowAccount.id },
        data: { availableBalance: { decrement: amount } }
      });
      await tx.accountBalance.update({
        where: { accountId: userAccount.id },
        data: { availableBalance: { increment: amount } }
      });

      await tx.transaction.create({
        data: {
          idempotencyKey: generateIdempotencyKey(txType, gameRoundId, userId),
          type: txType,
          gameRoundId,
          description: `Pago de premio ${txType}`,
          metadata: JSON.stringify({ userId, amount }),
          ledgerEntries: {
            create: [
              { accountId: escrowAccount.id, amount: -amount },
              { accountId: userAccount.id, amount: amount }
            ]
          }
        }
      });
    };

    // 4. Payout 1-line winner
    if (winners.line1 && line1Amount > 0) {
      await payWinner(winners.line1, line1Amount, 'WIN_PAYOUT_1LINE');
    }

    // 5. Payout 2-lines winner
    if (winners.line2 && line2Amount > 0) {
      await payWinner(winners.line2, line2Amount, 'WIN_PAYOUT_2LINES');
    }

    // 6. Payout full-card winner
    if (winners.fullCard && fullCardAmount > 0) {
      await payWinner(winners.fullCard, fullCardAmount, 'WIN_PAYOUT_FULLCARD');
    }
  });

  logger.info(`Prizes distributed atomically for round ${gameRoundId}: House=${houseAmount.toFixed(2)}Bs, 1Line=${line1Amount.toFixed(2)}Bs, 2Lines=${line2Amount.toFixed(2)}Bs, FullCard=${fullCardAmount.toFixed(2)}Bs`);
}
