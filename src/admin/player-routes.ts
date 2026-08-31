import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, purchaseCard, purchaseCardsBatch, calculatePackagePrice } from '../wallet/ledger';
import { config } from '../config/env';
import { getSystemSettings } from '../config/settings';
import { generateCard } from '../game/card-generator';
import { GameScheduler } from '../game/scheduler';

// Generate player token
const generatePlayerToken = (userId: string, phone: string) => {
  return jwt.sign({ userId, phone, role: 'player' }, config.jwtSecret, { expiresIn: '15d' });
};

// Register player
export const playerRegister = async (req: Request, res: Response) => {
  try {
    const { phone, name, pin, email, cedula, bankCode, bankAccount } = req.body;
    
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ error: 'Ingresa tu Nombre y Apellido completo' });
    }
    if (!cedula || cedula.trim().length < 6) {
      return res.status(400).json({ error: 'Ingresa tu Cédula de Identidad (ej: V-12345678)' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Número de WhatsApp es requerido' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Número de WhatsApp inválido (mínimo 10 dígitos)' });
    }

    if (!bankCode) {
      return res.status(400).json({ error: 'Selecciona tu banco de Pago Móvil' });
    }

    const cleanBankAccount = (bankAccount || cleanPhone).replace(/[^0-9]/g, '');
    if (cleanBankAccount.length < 10) {
      return res.status(400).json({ error: 'Ingresa un teléfono válido para recibir tu Pago Móvil' });
    }

    const cleanPin = String(pin || '').trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'El PIN de seguridad debe tener exactamente 4 dígitos numéricos' });
    }

    const existing = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (existing) {
      return res.status(400).json({ error: 'Este número de teléfono ya está registrado. Por favor inicia sesión.' });
    }

    const pinHash = await bcrypt.hash(cleanPin, 10);

    const user = await prisma.user.create({
      data: {
        phone: cleanPhone,
        name: name.trim(),
        pinHash,
        email: email?.trim() || null,
        cedula: cedula.trim(),
        bankCode: bankCode.trim(),
        bankAccount: cleanBankAccount,
        accounts: {
          create: {
            type: 'USER_REAL',
            balance: { create: { availableBalance: 0, lockedBalance: 0 } }
          }
        }
      },
      include: {
        accounts: { include: { balance: true } }
      }
    });

    const token = generatePlayerToken(user.id, user.phone);
    const balance = user.accounts[0]?.balance?.availableBalance || 0;

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        cedula: user.cedula,
        bankCode: user.bankCode,
        bankAccount: user.bankAccount,
        balance,
        lockedBalance: 0
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al registrar usuario' });
  }
};

// Login player
export const playerLogin = async (req: Request, res: Response) => {
  try {
    const { phone, pin, name } = req.body;
    if (!phone) return res.status(400).json({ error: 'Teléfono es requerido' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    let user = await prisma.user.findUnique({
      where: { phone: cleanPhone },
      include: { accounts: { include: { balance: true } } }
    });

    if (!user) {
      // Auto-register for smooth transition if user doesn't exist yet
      let pinHash: string | undefined = undefined;
      if (pin) {
        const cleanPin = String(pin).trim();
        if (/^\d{4}$/.test(cleanPin)) {
          pinHash = await bcrypt.hash(cleanPin, 10);
        }
      }

      user = await prisma.user.create({
        data: {
          phone: cleanPhone,
          name: name?.trim() || `Jugador ${cleanPhone.slice(-4)}`,
          pinHash,
          accounts: {
            create: {
              type: 'USER_REAL',
              balance: { create: { availableBalance: 0, lockedBalance: 0 } }
            }
          }
        },
        include: { accounts: { include: { balance: true } } }
      });
    } else {
      // If user has a registered PIN, verify it
      if (user.pinHash && pin) {
        const valid = await bcrypt.compare(String(pin).trim(), user.pinHash);
        if (!valid) {
          return res.status(401).json({ error: 'PIN incorrecto. Verifica tus 4 dígitos.' });
        }
      } else if (user.pinHash && !pin) {
        // User has PIN configured but none sent
        return res.status(401).json({ error: 'Ingresa tu PIN de 4 dígitos para ingresar.', requirePin: true });
      }
    }

    if (user.isBlocked) {
      return res.status(403).json({ error: 'Tu cuenta se encuentra suspendida. Contacta a soporte.' });
    }

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() }
    });

    const token = generatePlayerToken(user.id, user.phone);
    const balance = user.accounts[0]?.balance?.availableBalance || 0;
    const lockedBalance = user.accounts[0]?.balance?.lockedBalance || 0;

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        cedula: user.cedula,
        bankCode: user.bankCode,
        bankAccount: user.bankAccount,
        balance,
        lockedBalance
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Get current player profile & balance
export const getPlayerMe = async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'Teléfono es requerido' });

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
    const lockedBalance = user.accounts[0]?.balance?.lockedBalance || 0;
    const settings = getSystemSettings();

    res.json({
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      cedula: user.cedula,
      bankCode: user.bankCode,
      bankAccount: user.bankAccount,
      balance,
      lockedBalance,
      cardPriceBs: settings.roomClasicaPriceBs,
      pagoMovil: {
        banco: settings.pagoMovilBanco,
        cedula: settings.pagoMovilCedula,
        telefono: settings.pagoMovilTelefono
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Update Player Profile & Banking info
export const playerUpdateProfile = async (req: Request, res: Response) => {
  try {
    const { phone, name, email, cedula, bankCode, bankAccount, newPin } = req.body;
    if (!phone) return res.status(400).json({ error: 'Teléfono es requerido' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const dataToUpdate: any = {};
    if (name !== undefined) dataToUpdate.name = name.trim();
    if (email !== undefined) dataToUpdate.email = email.trim();
    if (cedula !== undefined) dataToUpdate.cedula = cedula.trim();
    if (bankCode !== undefined) dataToUpdate.bankCode = bankCode.trim();
    if (bankAccount !== undefined) dataToUpdate.bankAccount = bankAccount.trim();

    if (newPin) {
      const cleanPin = String(newPin).trim();
      if (!/^\d{4}$/.test(cleanPin)) {
        return res.status(400).json({ error: 'El nuevo PIN debe tener exactamente 4 dígitos numéricos' });
      }
      dataToUpdate.pinHash = await bcrypt.hash(cleanPin, 10);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: dataToUpdate,
      include: { accounts: { include: { balance: true } } }
    });

    res.json({
      success: true,
      user: {
        id: updated.id,
        phone: updated.phone,
        name: updated.name,
        email: updated.email,
        cedula: updated.cedula,
        bankCode: updated.bankCode,
        bankAccount: updated.bankAccount,
        balance: updated.accounts[0]?.balance?.availableBalance || 0,
        lockedBalance: updated.accounts[0]?.balance?.lockedBalance || 0
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar perfil' });
  }
};

// Get Player Transactions & Ledger History
export const getPlayerTransactions = async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'Teléfono es requerido' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({
      where: { phone: cleanPhone },
      include: { accounts: { where: { type: 'USER_REAL' } } }
    });

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const userAccountId = user.accounts[0]?.id;

    // Fetch Deposits
    const deposits = await prisma.pagoMovilDeposit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // Fetch Withdrawals
    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // Fetch Ledger entries (Card purchases, Win payouts)
    const ledgerEntries = userAccountId ? await prisma.ledgerEntry.findMany({
      where: { accountId: userAccountId },
      include: { transaction: true },
      orderBy: { createdAt: 'desc' },
      take: 30
    }) : [];

    res.json({
      deposits: deposits.map(d => ({
        id: d.id,
        type: 'DEPOSIT',
        amount: d.amount,
        reference: d.referenceCode,
        status: d.status,
        date: d.createdAt
      })),
      withdrawals: withdrawals.map(w => ({
        id: w.id,
        type: 'WITHDRAWAL',
        amount: w.amount,
        bankCode: w.bankCode,
        status: w.status,
        date: w.createdAt,
        rejectionReason: w.rejectionReason
      })),
      ledger: ledgerEntries.map(l => ({
        id: l.id,
        type: l.transaction.type,
        amount: l.amount,
        description: l.transaction.description,
        balanceAfter: l.balanceAfter,
        date: l.createdAt
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Active Online Users Tracker (TTL 45 seconds)
const onlineUsers = new Map<string, number>();

export const trackOnlineUser = (req: Request) => {
  const phone = (req.query.phone as string) || (req.body?.phone as string);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = phone ? `phone:${phone}` : `ip:${ip}`;
  onlineUsers.set(key, Date.now());
};

export const getOnlineCount = () => {
  const now = Date.now();
  const cutoff = now - 45000;
  for (const [k, v] of onlineUsers.entries()) {
    if (v < cutoff) onlineUsers.delete(k);
  }
  return Math.max(1, onlineUsers.size);
};

// Get live game status for player web app
export const getPlayerGame = async (req: Request, res: Response) => {
  try {
    trackOnlineUser(req);

    // Check for active round or recently finished round (15s celebration buffer)
    let activeRound = await prisma.gameRound.findFirst({
      where: { status: { in: ['WAITING', 'SELLING', 'DRAWING', 'PAUSED'] } },
      orderBy: { roundNumber: 'desc' },
      include: {
        drawnBalls: { orderBy: { sequence: 'asc' } },
        _count: { select: { cards: true } }
      }
    });

    if (!activeRound) {
      const recentFinished = await prisma.gameRound.findFirst({
        where: { status: 'FINISHED' },
        orderBy: { roundNumber: 'desc' },
        include: {
          drawnBalls: { orderBy: { sequence: 'asc' } },
          _count: { select: { cards: true } }
        }
      });
      if (recentFinished && recentFinished.finishedAt && (Date.now() - new Date(recentFinished.finishedAt).getTime() < 15000)) {
        activeRound = recentFinished;
      }
    }

    const onlineCount = getOnlineCount();

    // Query accumulated seed pot from HOUSE_JACKPOT
    const jackpotAcc = await prisma.account.findFirst({
      where: { type: 'HOUSE_JACKPOT' },
      include: { balance: true }
    });
    const accumulatedSeed = jackpotAcc?.balance?.availableBalance || 0;

    if (!activeRound) {
      return res.json({
        hasActiveGame: false,
        onlineCount,
        activePlayersCount: 0,
        totalCards: 0,
        prizePool: accumulatedSeed,
        nextRoundScheduledAt: GameScheduler.nextRoundAt?.toISOString() || null,
        message: 'Esperando próxima ronda...'
      });
    }

    // Real distinct active players in current round
    const cardsInRound = await prisma.card.findMany({
      where: { gameRoundId: activeRound.id },
      select: { userId: true }
    });
    const activePlayersCount = new Set(cardsInRound.map(c => c.userId)).size;

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

    const settings = getSystemSettings();

    res.json({
      hasActiveGame: true,
      roundId: activeRound.id,
      roundNumber: activeRound.roundNumber,
      status: activeRound.status,
      totalCards: cardsInRound.length,
      activePlayersCount,
      onlineCount,
      prizePool: Number(activeRound.prizePool),
      cardPriceBs: settings.roomClasicaPriceBs,
      payoutRules: {
        housePercentage: settings.housePercentage,
        prize1LinePercentage: settings.prize1LinePercentage,
        prize2LinesPercentage: settings.prize2LinesPercentage,
        prizeFullCardPercentage: settings.prizeFullCardPercentage,
        reserveSeedPercentage: settings.reserveSeedPercentage
      },
      drawnBalls: activeRound.drawnBalls.map(b => ({ number: b.number, column: b.column, sequence: b.sequence })),
      // Timing data for countdown clocks
      sellingStartedAt: activeRound.sellingStartedAt?.toISOString() || null,
      drawingStartedAt: activeRound.drawingStartedAt?.toISOString() || null,
      scheduledAt: activeRound.scheduledAt?.toISOString() || null,
      nextRoundScheduledAt: GameScheduler.nextRoundAt?.toISOString() || null,
      createdAt: activeRound.createdAt.toISOString(),
      sellingWindowSeconds: settings.sellingWindowSeconds,
      ballDrawIntervalSeconds: settings.ballDrawIntervalSeconds,
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

    let activeRound = await prisma.gameRound.findFirst({
      where: { status: { in: ['WAITING', 'SELLING', 'DRAWING', 'PAUSED'] } },
      orderBy: { roundNumber: 'desc' },
      include: { drawnBalls: true }
    });

    if (!activeRound) {
      const recentFinished = await prisma.gameRound.findFirst({
        where: { status: 'FINISHED' },
        orderBy: { roundNumber: 'desc' },
        include: { drawnBalls: true }
      });
      if (recentFinished && recentFinished.finishedAt && (Date.now() - new Date(recentFinished.finishedAt).getTime() < 15000)) {
        activeRound = recentFinished;
      }
    }

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

// Player card purchase (Supports "Lleva 6 Paga 4" Promos and Dynamic Room Pricing)
export const playerBuyCards = async (req: Request, res: Response) => {
  try {
    const { phone, count, roomPrice } = req.body;
    const numCount = parseInt(count);
    if (!phone || isNaN(numCount) || numCount < 1) return res.status(400).json({ error: 'Datos de compra inválidos' });

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

    const settings = getSystemSettings();
    if (existingCount + numCount > settings.maxCardsPerPlayer) {
      return res.status(400).json({ error: `Máximo ${settings.maxCardsPerPlayer} cartones por jugador. Ya tienes ${existingCount}.` });
    }

    const unitPrice = (typeof roomPrice === 'number' && roomPrice > 0) ? roomPrice : settings.roomClasicaPriceBs;
    const totalCost = calculatePackagePrice(numCount, unitPrice);
    const balance = user.accounts[0]?.balance?.availableBalance || 0;

    if (balance < totalCost) {
      return res.status(400).json({ error: `Saldo insuficiente. Necesitas ${totalCost.toFixed(2)} Bs y tienes ${balance.toFixed(2)} Bs.` });
    }

    const { cards, totalCost: chargedAmount } = await purchaseCardsBatch(user.id, activeRound.id, numCount, existingCount + 1, unitPrice);

    const updatedAcc = await prisma.accountBalance.findUnique({
      where: { accountId: user.accounts[0].id }
    });

    res.json({
      success: true,
      count: cards.length,
      chargedAmount,
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
    const numAmount = parseFloat(amount);
    if (!phone || isNaN(numAmount) || numAmount <= 0 || !referenceCode) {
      return res.status(400).json({ error: 'Monto y código de referencia válidos son requeridos' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const cleanRef = String(referenceCode).trim();
    const existing = await prisma.pagoMovilDeposit.findUnique({ where: { referenceCode: cleanRef } });
    if (existing) return res.status(400).json({ error: 'Esa referencia ya fue registrada anteriormente.' });

    const deposit = await prisma.pagoMovilDeposit.create({
      data: {
        userId: user.id,
        referenceCode: cleanRef,
        amount: numAmount,
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

// Player Withdrawal request (Atomically locks balance & enforces registered titular recipient!)
export const playerWithdraw = async (req: Request, res: Response) => {
  try {
    const { phone, amount, pin } = req.body;
    const numAmount = parseFloat(amount);
    if (!phone || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Monto de retiro inválido' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({
      where: { phone: cleanPhone },
      include: { accounts: { where: { type: 'USER_REAL' }, include: { balance: true } } }
    });

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Enforce PIN validation
    if (user.pinHash) {
      if (!pin) {
        return res.status(400).json({ error: 'Ingresa tu PIN de 4 dígitos para autorizar el retiro' });
      }
      const valid = await bcrypt.compare(String(pin).trim(), user.pinHash);
      if (!valid) {
        return res.status(401).json({ error: 'PIN de seguridad incorrecto' });
      }
    }

    // Verify user has registered bank data
    const targetBankCode = user.bankCode || config.pagoMovilBanco;
    const targetPhone = user.bankAccount || user.phone;
    const targetCedula = user.cedula || '';

    if (!targetCedula || !targetPhone) {
      return res.status(400).json({ error: 'Debes completar tu Cédula y Teléfono Pago Móvil en tu perfil antes de retirar' });
    }

    const userAccount = user.accounts[0];
    const availableBalance = userAccount?.balance?.availableBalance || 0;

    if (numAmount > availableBalance) {
      return res.status(400).json({ error: `Saldo insuficiente. Tienes ${availableBalance.toFixed(2)} Bs disponibles.` });
    }

    // Atomic Balance Lock: Available -> Locked
    const withdrawal = await prisma.$transaction(async (tx) => {
      // 1. Lock funds
      await tx.accountBalance.update({
        where: { accountId: userAccount.id },
        data: {
          availableBalance: { decrement: numAmount },
          lockedBalance: { increment: numAmount }
        }
      });

      // 2. Create withdrawal request ONLY to registered titular data
      const wr = await tx.withdrawalRequest.create({
        data: {
          userId: user.id,
          amount: numAmount,
          bankCode: targetBankCode,
          phoneNumber: targetPhone,
          cedulaNumber: targetCedula,
          status: 'PENDING'
        }
      });

      // 3. Create audit transaction
      await tx.transaction.create({
        data: {
          idempotencyKey: `WITHDRAW_REQ:${wr.id}`,
          type: 'WITHDRAW_LOCK',
          description: `Retiro solicitado a ${user.name} (${targetBankCode} - ${targetCedula} - ${targetPhone})`,
          metadata: JSON.stringify({ userId: user.id, amount: numAmount, bankCode: targetBankCode, cedula: targetCedula, phone: targetPhone })
        }
      });

      return wr;
    });

    const updatedAcc = await prisma.accountBalance.findUnique({
      where: { accountId: userAccount.id }
    });

    res.json({
      success: true,
      withdrawal,
      recipient: {
        name: user.name,
        cedula: targetCedula,
        bankCode: targetBankCode,
        phone: targetPhone
      },
      newAvailableBalance: updatedAcc?.availableBalance || 0,
      newLockedBalance: updatedAcc?.lockedBalance || 0
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
