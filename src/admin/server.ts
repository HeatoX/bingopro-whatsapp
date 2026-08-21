import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '../config/env';
import * as routes from './routes';
import * as playerRoutes from './player-routes';

export const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from web-dashboard
const dashboardPath = path.join(process.cwd(), 'web-dashboard');
app.use(express.static(dashboardPath));

// Auth Middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);

  try {
    const jwt = require('jsonwebtoken');
    jwt.verify(token, config.jwtSecret);
    next();
  } catch (error) {
    return res.sendStatus(403);
  }
};

// Routes
// Auth
app.post('/api/admin/login', routes.login);

// Public QR Code status endpoint
app.get('/api/qr', async (req, res) => {
  try {
    const { WhatsAppClient } = require('../whatsapp/client');
    const wa = WhatsAppClient.getInstance();
    const status = wa.getConnectionStatus();
    const qrDataUrl = await wa.getQRDataURL();
    res.json({ connected: status.connected, hasQR: status.hasQR, qr: qrDataUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Public Player Web App Endpoints
app.post('/api/player/login', playerRoutes.playerLogin);
app.get('/api/player/me', playerRoutes.getPlayerMe);
app.get('/api/player/game', playerRoutes.getPlayerGame);
app.get('/api/player/my-cards', playerRoutes.getPlayerCards);
app.post('/api/player/buy-cards', playerRoutes.playerBuyCards);
app.post('/api/player/deposit', playerRoutes.playerDeposit);
app.post('/api/player/withdraw', playerRoutes.playerWithdraw);

// Protected routes
const api = express.Router();
api.use(authenticateToken);

// Dashboard
api.get('/stats', routes.getStats);

// Users
api.get('/users', routes.getUsers);
api.post('/users/:id/block', routes.blockUser);

// Games
api.get('/games', routes.getGames);
api.get('/games/:id', routes.getGameDetails);
api.post('/games/pause', routes.pauseGame);
api.post('/games/resume', routes.resumeGame);

// Deposits
api.get('/deposits', routes.getDeposits);
api.post('/deposits/:id/approve', routes.approveDeposit);
api.post('/deposits/:id/reject', routes.rejectDeposit);

// Withdrawals
api.get('/withdrawals', routes.getWithdrawals);
api.post('/withdrawals/:id/process', routes.processWithdrawal);

// Finance
api.get('/finance', routes.getFinanceStats);

app.use('/api/admin', api);

// Serve index.html for all other routes to support SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

// Start server function
export const createAdminServer = (gameEngine?: any, scheduler?: any) => {
  return app;
};

export const startAdminServer = () => {
  app.listen(config.adminPort, () => {
    console.log(`Admin dashboard running on port ${config.adminPort}`);
  });
};

