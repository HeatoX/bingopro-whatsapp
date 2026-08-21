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

  const transaction = await prisma.transaction.create({
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

  await prisma.accountBalance.update({
    where: { accountId: userAccount.id },
    data: { availableBalance: { increment: amount } }
  });

  return transaction;
}

export async function purchaseCard(userId: string, gameRoundId: string, cardIndex: number) {
  const price = config.cardPriceBs;

  const userAccount = await prisma.account.findFirst({
    where: { userId, type: 'USER_REAL' },
    include: { balance: true }
  });
  const escrowAccount = await prisma.account.findFirst({
    where: { type: 'HOUSE_ESCROW' }
  });

  if (!userAccount || !userAccount.balance || !escrowAccount) {
    throw new Error('User or system accounts not found');
  }

  if (userAccount.balance.availableBalance < price) {
    throw new Error('INSUFFICIENT_FUNDS');
  }

  const { grid, hash } = generateCard(gameRoundId, cardIndex);
  const idempotencyKey = generateIdempotencyKey('BUY_CARD', gameRoundId, userId, hash);

  const existingTx = await prisma.transaction.findUnique({ where: { idempotencyKey } });
  if (existingTx) throw new Error('Card already purchased');

  // Deduct balance
  await prisma.accountBalance.update({
    where: { accountId: userAccount.id },
    data: { availableBalance: { decrement: price } }
  });

  // Create Transaction & Ledger
  await prisma.transaction.create({
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

  // Create Card Record
  const card = await prisma.card.create({
    data: {
      cardNumber: cardIndex,
      hash,
      userId,
      gameRoundId,
      grid: JSON.stringify(grid),
      purchasePrice: price,
    }
  });

  // Update GameRound totalCards
  await prisma.gameRound.update({
    where: { id: gameRoundId },
    data: { totalCards: { increment: 1 } }
  });

  return card;
}
