import { prisma } from './ledger';
import { generateIdempotencyKey } from '../utils/crypto';
import { logger } from '../utils/logger';

export interface BuyRaffleResult {
  success: boolean;
  tickets: Array<{ id: string; ticketNumber: string; price: number }>;
  totalCharged: number;
  newBalance: number;
  error?: string;
}

/**
 * Purchases one or more 4-digit raffle tickets (0000 - 9999) atomically.
 */
export async function purchaseRaffleTickets(
  userId: string,
  raffleId: string,
  ticketNumbers: string[]
): Promise<BuyRaffleResult> {
  // 1. Sanitize and validate 4-digit ticket numbers
  const formattedNumbers = ticketNumbers.map(n => String(n).trim().padStart(4, '0'));
  
  for (const num of formattedNumbers) {
    if (!/^\d{4}$/.test(num)) {
      return { success: false, tickets: [], totalCharged: 0, newBalance: 0, error: `Número de boleto inválido: ${num}. Debe ser de 4 dígitos (0000 a 9999).` };
    }
  }

  // Check for duplicates within the purchase request
  const uniqueNumbers = Array.from(new Set(formattedNumbers));
  if (uniqueNumbers.length !== formattedNumbers.length) {
    return { success: false, tickets: [], totalCharged: 0, newBalance: 0, error: 'Hay números duplicados en tu selección.' };
  }

  // 2. Fetch raffle and user
  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId } });
  if (!raffle) {
    return { success: false, tickets: [], totalCharged: 0, newBalance: 0, error: 'La rifa no existe.' };
  }
  if (raffle.status !== 'ACTIVE') {
    return { success: false, tickets: [], totalCharged: 0, newBalance: 0, error: 'Esta rifa ya no se encuentra activa para compras.' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: { where: { type: 'USER_REAL' }, include: { balance: true } } }
  });
  if (!user || user.accounts.length === 0) {
    return { success: false, tickets: [], totalCharged: 0, newBalance: 0, error: 'Cuenta de usuario no encontrada.' };
  }

  const userAccount = user.accounts[0];
  const totalCost = raffle.ticketPrice * uniqueNumbers.length;
  const availableBalance = userAccount.balance?.availableBalance || 0;

  if (availableBalance < totalCost) {
    return {
      success: false,
      tickets: [],
      totalCharged: 0,
      newBalance: availableBalance,
      error: `Saldo insuficiente. Total a pagar: Bs ${totalCost.toFixed(2)}, Saldo disponible: Bs ${availableBalance.toFixed(2)}`
    };
  }

  // 3. Check if any selected ticket is already sold
  const alreadySold = await prisma.raffleTicket.findMany({
    where: {
      raffleId,
      ticketNumber: { in: uniqueNumbers }
    }
  });

  if (alreadySold.length > 0) {
    const takenList = alreadySold.map(t => t.ticketNumber).join(', ');
    return {
      success: false,
      tickets: [],
      totalCharged: 0,
      newBalance: availableBalance,
      error: `Los siguientes números ya fueron vendidos: [${takenList}]. Por favor selecciona otros.`
    };
  }

  const houseRevenue = await prisma.account.findFirst({
    where: { type: 'HOUSE_REVENUE' },
    include: { balance: true }
  });

  // 4. Atomic transaction: Deduct balance, credit house, insert tickets & ledger audit
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Deduct player balance
      await tx.accountBalance.update({
        where: { accountId: userAccount.id },
        data: { availableBalance: { decrement: totalCost } }
      });

      // Credit house revenue
      if (houseRevenue) {
        await tx.accountBalance.update({
          where: { accountId: houseRevenue.id },
          data: { availableBalance: { increment: totalCost } }
        });
      }

      // Ledger transaction
      const idempotencyKey = generateIdempotencyKey('BUY_RAFFLE', raffleId, userId, String(Date.now()), uniqueNumbers.join('-'));
      await tx.transaction.create({
        data: {
          idempotencyKey,
          type: 'BUY_RAFFLE',
          description: `Compra de ${uniqueNumbers.length} boletos en Rifa: ${raffle.title}`,
          metadata: JSON.stringify({ raffleId, ticketNumbers: uniqueNumbers, totalCost, unitPrice: raffle.ticketPrice }),
          ledgerEntries: {
            create: [
              { accountId: userAccount.id, amount: -totalCost },
              ...(houseRevenue ? [{ accountId: houseRevenue.id, amount: totalCost }] : [])
            ]
          }
        }
      });

      // Create tickets
      const createdTickets = [];
      for (const num of uniqueNumbers) {
        const ticket = await tx.raffleTicket.create({
          data: {
            raffleId,
            userId,
            ticketNumber: num,
            purchasePrice: raffle.ticketPrice
          }
        });
        createdTickets.push({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          price: ticket.purchasePrice
        });
      }

      const updatedUserBalance = await tx.accountBalance.findUnique({
        where: { accountId: userAccount.id }
      });

      return {
        tickets: createdTickets,
        newBalance: updatedUserBalance?.availableBalance || 0
      };
    });

    logger.info(`🎟️ User ${user.phone} purchased ${uniqueNumbers.length} tickets for raffle "${raffle.title}" (Total: Bs ${totalCost.toFixed(2)})`);

    return {
      success: true,
      tickets: result.tickets,
      totalCharged: totalCost,
      newBalance: result.newBalance
    };

  } catch (err: any) {
    logger.error(`Error purchasing raffle tickets: ${err.message}`);
    return {
      success: false,
      tickets: [],
      totalCharged: 0,
      newBalance: availableBalance,
      error: err.message || 'Error al procesar la compra de boletos.'
    };
  }
}

/**
 * Declares the winner of a raffle based on the 4-digit winning number.
 */
export async function declareRaffleWinner(
  raffleId: string,
  winningNumber: string,
  isAutoVerified: boolean = false
) {
  const cleanNumber = String(winningNumber).trim().padStart(4, '0');

  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId }
  });
  if (!raffle) throw new Error('Rifa no encontrada');

  // Find the ticket matching the winning number
  const winningTicket = await prisma.raffleTicket.findFirst({
    where: {
      raffleId,
      ticketNumber: cleanNumber
    },
    include: { user: true }
  });

  const winnerUserId = winningTicket?.userId || null;
  const winnerName = winningTicket?.user?.name || null;
  const winnerPhone = winningTicket?.user?.phone || null;

  // Update raffle
  const updatedRaffle = await prisma.raffle.update({
    where: { id: raffleId },
    data: {
      status: 'DRAWN',
      winningNumber: cleanNumber,
      winnerUserId,
      winnerName,
      winnerPhone,
      isAutoVerified
    }
  });

  // Mark ticket as winner
  if (winningTicket) {
    await prisma.raffleTicket.update({
      where: { id: winningTicket.id },
      data: { isWinner: true }
    });
    logger.info(`👑 RAFFLE WINNER FOUND! Ticket #${cleanNumber} belonging to ${winnerName} (${winnerPhone}) won "${raffle.title}"!`);
  } else {
    logger.info(`ℹ️ Raffle "${raffle.title}" drawn with #${cleanNumber} — Ticket was NOT purchased (Vacante).`);
  }

  return {
    raffle: updatedRaffle,
    hasWinner: !!winningTicket,
    winnerTicket: winningTicket
  };
}
