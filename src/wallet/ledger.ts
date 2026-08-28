import { PrismaClient } from '@prisma/client';
import { generateIdempotencyKey } from '../utils/crypto';
import { generateCard } from '../game/card-generator';
import { config } from '../config/env';

export const prisma = new PrismaClient();

export async function deposit(userId: string, amount: number, referenceCode: string) {
  const idempotencyKey = `DEPOSIT:${referenceCode}`;
  
  const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const userAccount = await prisma.account.findFirst({
    where: { userId, type: 'USER_REAL' }
  });
  const gatewayAccount = await prisma.account.findFirst({
    where: { type: 'PAYMENT_GATEWAY' }
  });

  if (!userAccount || !gatewayAccount) throw new Error('Accounts not initialized');

  // Atomic deposit transaction
  return await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        idempotencyKey,
        type: 'DEPOSIT',
        description: `Pago Móvil Ref ${referenceCode}`,
        metadata: JSON.stringify({ referenceCode, userId, amount }),
        ledgerEntries: {
          create: [
            { accountId: gatewayAccount.id, amount: -amount },
            { accountId: userAccount.id, amount: amount }
          ]
        }
      }
    });

    await tx.accountBalance.update({
      where: { accountId: userAccount.id },
      data: { availableBalance: { increment: amount } }
    });

    return transaction;
  });
}

export async function purchaseCard(userId: string, gameRoundId: string, cardIndex: number) {
  const price = config.cardPriceBs;

  // Validate round is active and accepting purchases
  const round = await prisma.gameRound.findUnique({ where: { id: gameRoundId } });
  if (!round || round.status !== 'SELLING') {
    throw new Error('ROUND_NOT_SELLING');
  }

  const userAccount = await prisma.account.findFirst({
    where: { userId, type: 'USER_REAL' },
    include: { balance: true }
  });
  const escrowAccount = await prisma.account.findFirst({
    where: { type: 'HOUSE_ESCROW' },
    include: { balance: true }
  });

  if (!userAccount || !userAccount.balance || !escrowAccount || !escrowAccount.balance) {
    throw new Error('User or system accounts not found');
  }

  const { grid, hash } = generateCard(gameRoundId, cardIndex);
  const idempotencyKey = generateIdempotencyKey('BUY_CARD', gameRoundId, userId, hash);

  // Full ACID transaction for card purchase
  return await prisma.$transaction(async (tx) => {
    // Re-verify balance inside transaction
    const latestBalance = await tx.accountBalance.findUnique({
      where: { accountId: userAccount.id }
    });

    if (!latestBalance || latestBalance.availableBalance < price) {
      throw new Error('INSUFFICIENT_FUNDS');
    }

    const existingTx = await tx.transaction.findUnique({ where: { idempotencyKey } });
    if (existingTx) throw new Error('Card already purchased');

    // 1. Deduct user balance
    await tx.accountBalance.update({
      where: { accountId: userAccount.id },
      data: { availableBalance: { decrement: price } }
    });

    // 2. Increment Escrow balance
    await tx.accountBalance.update({
      where: { accountId: escrowAccount.id },
      data: { availableBalance: { increment: price } }
    });

    // 3. Create Transaction & balanced Double-Entry Ledger
    await tx.transaction.create({
      data: {
        idempotencyKey,
        type: 'BUY_CARD',
        gameRoundId,
        metadata: JSON.stringify({ userId, cardIndex, price }),
        ledgerEntries: {
          create: [
            { accountId: userAccount.id, amount: -price },
            { accountId: escrowAccount.id, amount: price }
          ]
        }
      }
    });

    // 4. Create Card Record
    const card = await tx.card.create({
      data: {
        cardNumber: cardIndex,
        hash,
        userId,
        gameRoundId,
        grid: JSON.stringify(grid),
        purchasePrice: price,
      }
    });

    // 5. Update GameRound totalCards and prizePool
    await tx.gameRound.update({
      where: { id: gameRoundId },
      data: {
        totalCards: { increment: 1 },
        prizePool: { increment: price }
      }
    });

    return card;
  });
}
