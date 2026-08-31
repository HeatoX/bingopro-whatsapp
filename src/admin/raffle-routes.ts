import { Request, Response } from 'express';
import { prisma } from '../wallet/ledger';
import { purchaseRaffleTickets, declareRaffleWinner } from '../wallet/raffle-ledger';
import { fetchSuperGana10pmResults } from '../game/supergana-scraper';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// ============================================
// PLAYER ENDPOINTS
// ============================================

/**
 * Get all active and recent raffles for player view
 */
export const getPlayerRaffles = async (req: Request, res: Response) => {
  try {
    const raffles = await prisma.raffle.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tickets: true } }
      }
    });

    const formatted = raffles.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      imageUrl: r.imageUrl || '/img/raffle-default.png',
      ticketPrice: r.ticketPrice,
      totalNumbers: r.totalNumbers,
      soldCount: r._count.tickets,
      soldPercentage: ((r._count.tickets / r.totalNumbers) * 100).toFixed(1),
      status: r.status,
      drawDate: r.drawDate,
      lotteryName: r.lotteryName,
      winningNumber: r.winningNumber,
      winnerName: r.winnerName,
      winnerPhone: r.winnerPhone ? `${r.winnerPhone.slice(0, 4)}***${r.winnerPhone.slice(-2)}` : null,
      isAutoVerified: r.isAutoVerified,
      createdAt: r.createdAt
    }));

    res.json(formatted);
  } catch (error: any) {
    logger.error(`Error in getPlayerRaffles: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get raffle details including all sold ticket numbers for the interactive 10,000 grid
 */
export const getPlayerRaffleDetail = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const raffle = await prisma.raffle.findUnique({
      where: { id },
      include: {
        tickets: { select: { ticketNumber: true } }
      }
    });

    if (!raffle) return res.status(404).json({ error: 'Rifa no encontrada' });

    const soldNumbers = (raffle as any).tickets.map((t: any) => t.ticketNumber);

    res.json({
      id: raffle.id,
      title: raffle.title,
      description: raffle.description,
      imageUrl: raffle.imageUrl,
      ticketPrice: raffle.ticketPrice,
      totalNumbers: raffle.totalNumbers,
      soldCount: soldNumbers.length,
      soldPercentage: ((soldNumbers.length / raffle.totalNumbers) * 100).toFixed(1),
      soldNumbers, // array of 4-digit strings already taken
      status: raffle.status,
      drawDate: raffle.drawDate,
      lotteryName: raffle.lotteryName,
      winningNumber: raffle.winningNumber,
      winnerName: raffle.winnerName,
      winnerPhone: raffle.winnerPhone ? `${raffle.winnerPhone.slice(0, 4)}***${raffle.winnerPhone.slice(-2)}` : null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get logged-in player's purchased tickets for a raffle
 */
export const getMyRaffleTickets = async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;
    const raffleId = req.query.raffleId as string;

    if (!phone) return res.status(400).json({ error: 'Teléfono es requerido' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const whereClause: any = { userId: user.id };
    if (raffleId) whereClause.raffleId = raffleId;

    const tickets = await prisma.raffleTicket.findMany({
      where: whereClause,
      include: { raffle: true },
      orderBy: { purchasedAt: 'desc' }
    });

    res.json({
      tickets: tickets.map(t => ({
        id: t.id,
        raffleId: t.raffleId,
        raffleTitle: t.raffle.title,
        ticketNumber: t.ticketNumber,
        purchasePrice: t.purchasePrice,
        purchasedAt: t.purchasedAt,
        isWinner: t.isWinner,
        raffleStatus: t.raffle.status,
        winningNumber: t.raffle.winningNumber
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Generate N random unsold 4-digit numbers for "Quick Pick / Al Azar"
 */
export const getRandomRaffleTickets = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const count = Math.min(50, Math.max(1, parseInt(req.query.count as string) || 1));

    const raffle = await prisma.raffle.findUnique({
      where: { id },
      include: { tickets: { select: { ticketNumber: true } } }
    });
    if (!raffle) return res.status(404).json({ error: 'Rifa no encontrada' });

    const soldSet = new Set((raffle as any).tickets.map((t: any) => t.ticketNumber));
    const availableCount = raffle.totalNumbers - soldSet.size;

    if (availableCount < count) {
      return res.status(400).json({ error: `Solo quedan ${availableCount} números disponibles.` });
    }

    const picked: string[] = [];
    const pickedSet = new Set<string>();

    while (picked.length < count) {
      const randInt = Math.floor(Math.random() * raffle.totalNumbers);
      const numStr = String(randInt).padStart(4, '0');
      if (!soldSet.has(numStr) && !pickedSet.has(numStr)) {
        pickedSet.add(numStr);
        picked.push(numStr);
      }
    }

    res.json({ success: true, count: picked.length, numbers: picked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Buy raffle tickets atomically
 */
export const buyPlayerRaffleTickets = async (req: Request, res: Response) => {
  try {
    const { phone, raffleId, numbers } = req.body;
    if (!phone || !raffleId || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'phone, raffleId y lista de números son requeridos' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const result = await purchaseRaffleTickets(user.id, raffleId, numbers);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Error al comprar boletos' });
  }
};

// ============================================
// ADMIN RAFFLE CONTROLLERS
// ============================================

/**
 * Admin: List all raffles with detailed stats
 */
export const adminGetRaffles = async (_req: Request, res: Response) => {
  try {
    const raffles = await prisma.raffle.findMany({
      include: {
        tickets: { select: { id: true, purchasePrice: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const enriched = raffles.map(r => {
      const soldCount = r.tickets.length;
      const totalRevenue = r.tickets.reduce((acc, t) => acc + t.purchasePrice, 0);
      const expectedRevenue = r.totalNumbers * r.ticketPrice;
      const soldPercentage = ((soldCount / r.totalNumbers) * 100).toFixed(1);

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        imageUrl: r.imageUrl,
        ticketPrice: r.ticketPrice,
        totalNumbers: r.totalNumbers,
        soldCount,
        soldPercentage,
        totalRevenue,
        expectedRevenue,
        status: r.status,
        drawDate: r.drawDate,
        lotteryName: r.lotteryName,
        winningNumber: r.winningNumber,
        winnerName: r.winnerName,
        winnerPhone: r.winnerPhone,
        isAutoVerified: r.isAutoVerified,
        createdAt: r.createdAt
      };
    });

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Admin: Create a new 10,000 number raffle
 */
export const adminCreateRaffle = async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      imageUrl,
      ticketPrice,
      totalNumbers,
      lotteryName,
      drawDate
    } = req.body;

    if (!title || !ticketPrice) {
      return res.status(400).json({ error: 'Título y precio por boleto son requeridos' });
    }

    const price = parseFloat(ticketPrice);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }

    const raffle = await prisma.raffle.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        ticketPrice: price,
        totalNumbers: parseInt(totalNumbers) || 10000,
        lotteryName: lotteryName?.trim() || 'SuperGana 10:00 PM',
        drawDate: drawDate ? new Date(drawDate) : null,
        status: 'ACTIVE'
      }
    });

    res.json({ success: true, raffle });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Admin: Update raffle
 */
export const adminUpdateRaffle = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const {
      title,
      description,
      imageUrl,
      ticketPrice,
      status,
      drawDate,
      lotteryName
    } = req.body;

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();
    if (imageUrl !== undefined) data.imageUrl = imageUrl.trim();
    if (ticketPrice !== undefined) data.ticketPrice = parseFloat(ticketPrice);
    if (status !== undefined) data.status = status;
    if (drawDate !== undefined) data.drawDate = drawDate ? new Date(drawDate) : null;
    if (lotteryName !== undefined) data.lotteryName = lotteryName.trim();

    const raffle = await prisma.raffle.update({
      where: { id },
      data
    });

    res.json({ success: true, raffle });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Admin: Delete raffle
 */
export const adminDeleteRaffle = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.raffle.delete({ where: { id } });
    res.json({ success: true, message: 'Rifa eliminada correctamente' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Admin: Scrape SuperGana 10:00 PM live result
 */
export const adminCheckSuperGanaResult = async (req: Request, res: Response) => {
  try {
    const dateStr = req.query.date as string;
    const result = await fetchSuperGana10pmResults(dateStr);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Admin: Draw/Finalize Raffle with 4-digit winning number
 */
export const adminDrawRaffleWinner = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { winningNumber, isAutoVerified } = req.body;

    if (!winningNumber || !/^\d{1,4}$/.test(String(winningNumber).trim())) {
      return res.status(400).json({ error: 'Ingresa un número ganador válido de 4 cifras (ej: 2266 o 0729)' });
    }

    const result = await declareRaffleWinner(id, String(winningNumber), !!isAutoVerified);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Admin: Upload image for raffle prize (Base64 or multipart)
 */
export const adminUploadRaffleImage = async (req: Request, res: Response) => {
  try {
    const { base64Data, filename } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'Imagen base64 requerida' });
    }

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Formato de imagen inválido' });
    }

    const ext = matches[1].split('/')[1] || 'png';
    const buffer = Buffer.from(matches[2], 'base64');

    const uploadDir = path.join(process.cwd(), 'web-dashboard', 'uploads', 'raffles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeFilename = `raffle-${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, safeFilename);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/raffles/${safeFilename}`;
    logger.info(`📸 Raffle image uploaded: ${publicUrl}`);

    res.json({ success: true, imageUrl: publicUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
