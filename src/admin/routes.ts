import { Request, Response } from 'express';
import { prisma, deposit as creditDeposit } from '../wallet/ledger';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { getSystemSettings, updateSystemSettings, getRoomList } from '../config/settings';

// Auth
export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (username === config.adminUsername && password === config.adminPassword) {
    const token = jwt.sign({ username }, config.jwtSecret, { expiresIn: '24h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciales inválidas' });
  }
};

// Dashboard Stats
export const getStats = async (req: Request, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeGame = await prisma.gameRound.findFirst({
      where: { status: { in: ['WAITING', 'SELLING', 'DRAWING', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' }
    });
    
    // Total revenue from all completed games (House Rake)
    const revenueStats = await prisma.gameRound.aggregate({
      where: { status: 'FINISHED' },
      _sum: { houseRake: true }
    });

    res.json({
      totalUsers,
      activeGame: activeGame || null,
      totalRevenue: revenueStats._sum.houseRake || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Users
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        accounts: {
          include: { balance: true }
        }
      },
      orderBy: { registeredAt: 'desc' },
      take: 100
    });
    
    const formattedUsers = users.map(user => {
      const realAccount = user.accounts.find(a => a.type === 'USER_REAL');
      return {
        id: user.id,
        phone: user.phone,
        name: user.name,
        isBlocked: user.isBlocked,
        registeredAt: user.registeredAt,
        balance: realAccount?.balance?.availableBalance || 0
      };
    });
    
    res.json(formattedUsers);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const blockUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { block } = req.body; // true to block, false to unblock
    const user = await prisma.user.update({
      where: { id },
      data: { isBlocked: block }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Games
export const getGames = async (req: Request, res: Response) => {
  try {
    const games = await prisma.gameRound.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getGameDetails = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const game = await prisma.gameRound.findUnique({
      where: { id },
      include: {
        cards: true,
        drawnBalls: { orderBy: { sequence: 'asc' } }
      }
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const pauseGame = async (req: Request, res: Response) => {
  try {
    const activeGame = await prisma.gameRound.findFirst({
      where: { status: 'DRAWING' }
    });
    if (!activeGame) return res.status(400).json({ error: 'No drawing game found to pause' });
    
    const game = await prisma.gameRound.update({
      where: { id: activeGame.id },
      data: { status: 'PAUSED' }
    });
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resumeGame = async (req: Request, res: Response) => {
  try {
    const activeGame = await prisma.gameRound.findFirst({
      where: { status: 'PAUSED' }
    });
    if (!activeGame) return res.status(400).json({ error: 'No paused game found to resume' });
    
    const game = await prisma.gameRound.update({
      where: { id: activeGame.id },
      data: { status: 'DRAWING' }
    });
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Deposits
export const getDeposits = async (req: Request, res: Response) => {
  try {
    const deposits = await prisma.pagoMovilDeposit.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });
    res.json(deposits);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const approveDeposit = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const depositRecord = await prisma.pagoMovilDeposit.findUnique({ where: { id } });
    if (!depositRecord) return res.status(404).json({ error: 'Depósito no encontrado' });
    if (depositRecord.status !== 'PENDING') return res.status(400).json({ error: 'Ya fue procesado' });

    await prisma.pagoMovilDeposit.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date() }
    });

    // Acreditar saldo real al usuario
    await creditDeposit(depositRecord.userId, depositRecord.amount, depositRecord.referenceCode);

    // Notificar al usuario por WhatsApp
    try {
      const user = await prisma.user.findUnique({ where: { id: depositRecord.userId } });
      if (user?.phone) {
        const { WhatsAppClient } = require('../whatsapp/client');
        const wa = WhatsAppClient.getInstance();
        await wa.sendText(user.phone + '@s.whatsapp.net',
          `✅ *¡Recarga Aprobada!*\n\n` +
          `💰 Monto: *${depositRecord.amount.toFixed(2)} Bs*\n` +
          `📝 Ref: *${depositRecord.referenceCode}*\n\n` +
          `Tu saldo ha sido actualizado. Usa \`!saldo\` para verificar.`
        );
      }
    } catch (e: any) { /* notification is best-effort */ }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const rejectDeposit = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const deposit = await prisma.pagoMovilDeposit.update({
      where: { id },
      data: { status: 'REJECTED' }
    });
    res.json({ success: true, deposit });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Withdrawals
export const getWithdrawals = async (req: Request, res: Response) => {
  try {
    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const processWithdrawal = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const reqRecord = await prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!reqRecord || reqRecord.status !== 'PENDING') {
      return res.status(400).json({ error: 'Solicitud no encontrada o ya procesada' });
    }

    const userAccount = await prisma.account.findFirst({
      where: { userId: reqRecord.userId, type: 'USER_REAL' }
    });
    const gatewayAccount = await prisma.account.findFirst({
      where: { type: { in: ['PAYMENT_GATEWAY', 'HOUSE_REVENUE'] } }
    });

    await prisma.$transaction(async (tx) => {
      await tx.withdrawalRequest.update({
        where: { id },
        data: { status: 'APPROVED', processedAt: new Date() }
      });

      if (userAccount) {
        await tx.accountBalance.update({
          where: { accountId: userAccount.id },
          data: { lockedBalance: { decrement: reqRecord.amount } }
        });

        const ledgerEntriesToCreate = [
          { accountId: userAccount.id, amount: -reqRecord.amount }
        ];
        if (gatewayAccount) {
          ledgerEntriesToCreate.push({ accountId: gatewayAccount.id, amount: reqRecord.amount });
        }

        await tx.transaction.create({
          data: {
            idempotencyKey: `WITHDRAWAL:${id}`,
            type: 'WITHDRAWAL',
            description: `Retiro Pago Móvil procesado a ${reqRecord.phoneNumber} (${reqRecord.bankCode} - ${reqRecord.cedulaNumber})`,
            metadata: JSON.stringify({ userId: reqRecord.userId, amount: reqRecord.amount, bankCode: reqRecord.bankCode, cedula: reqRecord.cedulaNumber }),
            ledgerEntries: {
              create: ledgerEntriesToCreate
            }
          }
        });
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const rejectWithdrawal = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body || {};
    const reqRecord = await prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!reqRecord || reqRecord.status !== 'PENDING') {
      return res.status(400).json({ error: 'Solicitud no encontrada o ya procesada' });
    }

    const userAccount = await prisma.account.findFirst({
      where: { userId: reqRecord.userId, type: 'USER_REAL' }
    });

    await prisma.$transaction(async (tx) => {
      await tx.withdrawalRequest.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: reason || 'Rechazado por administración' }
      });

      // Return locked funds back to available balance
      if (userAccount) {
        await tx.accountBalance.update({
          where: { accountId: userAccount.id },
          data: {
            lockedBalance: { decrement: reqRecord.amount },
            availableBalance: { increment: reqRecord.amount }
          }
        });
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

// Finance
export const getFinanceStats = async (req: Request, res: Response) => {
  try {
    const depositsAgg = await prisma.pagoMovilDeposit.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true }
    });
    
    const withdrawalsAgg = await prisma.withdrawalRequest.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true }
    });
    
    const houseRakeAgg = await prisma.gameRound.aggregate({
      where: { status: 'FINISHED' },
      _sum: { houseRake: true }
    });
    
    res.json({
      totalDeposits: depositsAgg._sum.amount || 0,
      totalWithdrawals: withdrawalsAgg._sum.amount || 0,
      houseRevenue: houseRakeAgg._sum.houseRake || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Settings Management
export const getSettings = async (req: Request, res: Response) => {
  try {
    const settings = getSystemSettings();
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener configuración' });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const result = await updateSystemSettings(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Configuración inválida' });
    }
    res.json({ success: true, settings: result.settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al guardar configuración' });
  }
};

export const getRooms = async (req: Request, res: Response) => {
  try {
    const rooms = getRoomList();
    res.json(rooms);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener salas' });
  }
};


