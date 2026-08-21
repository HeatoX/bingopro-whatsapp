import { Request, Response } from 'express';
import { prisma, purchaseCard } from '../wallet/ledger';
import { config } from '../config/env';
import { generateCard } from '../game/card-generator';

// Login / Register player by phone number
export const playerLogin = async (req: Request, res: Response) => {
  try {
    const { phone, name } = req.body;
    if (!phone) return res.status(400).json({ error: 'Teléfono es requerido' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    let user = await prisma.user.findUnique({ where: { phone: cleanPhone } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: cleanPhone,
          name: name || `Jugador ${cleanPhone.slice(-4)}`,
          accounts: {
            create: {
              type: 'USER_REAL',
              balance: { create: { availableBalance: 0, lockedBalance: 0 } }
            }
          }
        }
      });
    }

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Get current player profile & balance
export const getPlayerMe = async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({
      where: { phone: cleanPhone },
      include: {
        accounts: {
          where: { type: 'USER_REAL' },
          include: { balance: true }
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const balance = user.accounts[0]?.balance?.availableBalance || 0;

    res.json({
      id: user.id,
      phone: user.phone,
      name: user.name,
      balance,
      cardPriceBs: config.cardPriceBs,
      pagoMovil: {
        banco: config.pagoMovilBanco,
        cedula: config.pagoMovilCedula,
        telefono: config.pagoMovilTelefono
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Get live game status for player web app
export const getPlayerGame = async (req: Request, res: Response) => {
  try {
    const activeRound = await prisma.gameRound.findFirst({
      where: { status: { in: ['WAITING', 'SELLING', 'DRAWING', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        drawnBalls: { orderBy: { sequence: 'asc' } },
        _count: { select: { cards: true } }
      }
    });

    if (!activeRound) {
      return res.json({
        hasActiveGame: false,
        message: 'Esperando próxima ronda...'
      });
    }

    let winner1LineName = null;
    let winner2LinesName = null;
    let winnerFullCardName = null;

    if (activeRound.winner1LineUserId) {
      const u = await prisma.user.findUnique({ where: { id: activeRound.winner1LineUserId } });
      if (u) winner1LineName = u.name;
    }
    if (activeRound.winner2LinesUserId) {
      const u = await prisma.user.findUnique({ where: { id: activeRound.winner2LinesUserId } });
      if (u) winner2LinesName = u.name;
    }
    if (activeRound.winnerFullCardUserId) {
      const u = await prisma.user.findUnique({ where: { id: activeRound.winnerFullCardUserId } });
      if (u) winnerFullCardName = u.name;
    }

    res.json({
      hasActiveGame: true,
      roundId: activeRound.id,
      roundNumber: activeRound.roundNumber,
      status: activeRound.status,
      totalCards: activeRound.totalCards,
      prizePool: Number(activeRound.prizePool),
      cardPriceBs: config.cardPriceBs,
      drawnBalls: activeRound.drawnBalls.map(b => ({ number: b.number, column: b.column, sequence: b.sequence })),
      // Timing data for countdown clocks
      sellingStartedAt: activeRound.sellingStartedAt?.toISOString() || null,
      drawingStartedAt: activeRound.drawingStartedAt?.toISOString() || null,
      scheduledAt: activeRound.scheduledAt?.toISOString() || null,
      createdAt: activeRound.createdAt.toISOString(),
      sellingWindowSeconds: config.sellingWindowSeconds,
      ballDrawIntervalSeconds: config.ballDrawIntervalSeconds,
      // Winner data
      winner1LineUserId: activeRound.winner1LineUserId,
      winner1LineName,
      winner2LinesUserId: activeRound.winner2LinesUserId,
      winner2LinesName,
      winnerFullCardUserId: activeRound.winnerFullCardUserId,
      winnerFullCardName
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Get active cards for current player in active round
export const getPlayerCards = async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const activeRound = await prisma.gameRound.findFirst({
      where: { status: { in: ['WAITING', 'SELLING', 'DRAWING', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' },
      include: { drawnBalls: true }
    });

    if (!activeRound) return res.json({ cards: [], drawnNumbers: [] });

    const cards = await prisma.card.findMany({
      where: { userId: user.id, gameRoundId: activeRound.id },
      orderBy: { cardNumber: 'asc' }
    });

    const drawnNumbers = activeRound.drawnBalls.map(b => b.number);

    const formattedCards = cards.map(c => ({
      id: c.id,
      cardNumber: c.cardNumber,
      hash: c.hash.substring(0, 8).toUpperCase(),
      grid: JSON.parse(c.grid),
      isWinner: c.isWinner,
      winType: c.winType
    }));

    res.json({
      roundNumber: activeRound.roundNumber,
      drawnNumbers,
      cards: formattedCards
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Player card purchase
export const playerBuyCards = async (req: Request, res: Response) => {
  try {
    const { phone, count } = req.body;
    if (!phone || !count || count < 1) return res.status(400).json({ error: 'Datos inválidos' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({
      where: { phone: cleanPhone },
      include: { accounts: { where: { type: 'USER_REAL' }, include: { balance: true } } }
    });

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const activeRound = await prisma.gameRound.findFirst({
      where: { status: 'SELLING' },
      orderBy: { createdAt: 'desc' }
    });

    if (!activeRound) return res.status(400).json({ error: 'Las ventas no están abiertas en este momento' });

    const existingCount = await prisma.card.count({
      where: { userId: user.id, gameRoundId: activeRound.id }
    });

    if (existingCount + count > config.maxCardsPerPlayer) {
      return res.status(400).json({ error: `Máximo ${config.maxCardsPerPlayer} cartones por jugador. Ya tienes ${existingCount}.` });
    }

    const totalCost = count * config.cardPriceBs;
    const balance = user.accounts[0]?.balance?.availableBalance || 0;

    if (balance < totalCost) {
      return res.status(400).json({ error: `Saldo insuficiente. Necesitas ${totalCost.toFixed(2)} Bs y tienes ${balance.toFixed(2)} Bs.` });
    }

    const purchased = [];
    for (let i = 0; i < count; i++) {
      const card = await purchaseCard(user.id, activeRound.id, existingCount + i + 1);
      purchased.push(card);
    }

    const updatedAcc = await prisma.accountBalance.findUnique({
      where: { accountId: user.accounts[0].id }
    });

    res.json({
      success: true,
      count: purchased.length,
      newBalance: updatedAcc?.availableBalance || 0
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Player Pago Móvil deposit
export const playerDeposit = async (req: Request, res: Response) => {
  try {
    const { phone, amount, referenceCode } = req.body;
    if (!phone || !amount || !referenceCode) return res.status(400).json({ error: 'Faltan datos' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const existing = await prisma.pagoMovilDeposit.findUnique({ where: { referenceCode } });
    if (existing) return res.status(400).json({ error: 'Esa referencia ya fue registrada.' });

    const deposit = await prisma.pagoMovilDeposit.create({
      data: {
        userId: user.id,
        referenceCode,
        amount: parseFloat(amount),
        bankCode: config.pagoMovilBanco,
        phoneNumber: cleanPhone,
        status: 'PENDING'
      }
    });

    res.json({ success: true, deposit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Player Withdrawal request
export const playerWithdraw = async (req: Request, res: Response) => {
  try {
    const { phone, amount, bankCode, cedula } = req.body;
    if (!phone || !amount || amount <= 0) return res.status(400).json({ error: 'Datos inválidos' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({
      where: { phone: cleanPhone },
      include: { accounts: { where: { type: 'USER_REAL' }, include: { balance: true } } }
    });

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const balance = user.accounts[0]?.balance?.availableBalance || 0;
    if (amount > balance) return res.status(400).json({ error: 'Saldo insuficiente' });

    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        userId: user.id,
        amount: parseFloat(amount),
        bankCode: bankCode || config.pagoMovilBanco,
        phoneNumber: cleanPhone,
        cedulaNumber: cedula || '',
        status: 'PENDING'
      }
    });

    res.json({ success: true, withdrawal });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
