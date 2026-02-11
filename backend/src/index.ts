import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { initDB, getEnvInfo, runMigrations } from './db/index.js';
import accountsRouter from './routes/accounts.js';
import assetsRouter from './routes/assets.js';
import transactionsRouter from './routes/transactions.js';
import holdingsRouter from './routes/holdings.js';
import portfolioRouter from './routes/portfolio.js';
import historyRouter from './routes/history.js';
import alertsRouter from './routes/alerts.js';
import authRouter from './routes/auth.js';
import { initWebSocketServer } from './routes/ws.js';
import { realtimePriceService } from './services/realtimePriceService.js';
import { authMiddleware } from './middleware/auth.js';
import { checkAlerts, resetTriggeredAlerts } from './services/alertService.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Enable CORS for all routes
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    // and requests from localhost or 127.0.0.1 on any port
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
}));

// Handle preflight requests for all routes
app.options('*', cors());

app.use(express.json());
app.use(cookieParser());

// Public routes (no auth required)
app.use('/api/auth', authRouter);
app.get('/api/health', (req, res) => {
  const stats = realtimePriceService.getStats();
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    realtime: {
      enabled: true,
      clients: stats.clients,
      trackedAssets: stats.trackedAssets,
      binanceConnected: stats.binanceConnected,
      tiingoConnected: stats.tiingoConnected,
    },
  });
});
app.get('/api/realtime/stats', (req, res) => {
  res.json(realtimePriceService.getStats());
});

// Protected routes (auth required)
app.use(authMiddleware);
app.use('/api/accounts', accountsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/history', historyRouter);
app.use('/api/alerts', alertsRouter);

// Initialize DB then start server
initDB().then(async () => {
  // Run migrations to add users table and user_id columns
  await runMigrations();

  const { env, dbPath } = getEnvInfo();
  
  // Create HTTP server
  const server = createServer(app);
  
  // Initialize WebSocket server
  initWebSocketServer(server);
  
  // Start realtime price service
  realtimePriceService.start();

  // Alert checker job (every 5 minutes)
  setInterval(async () => {
    try {
      const triggered = await checkAlerts();
      if (triggered > 0) {
        console.log(`Alert checker: triggered ${triggered} alerts`);
      }
    } catch (error) {
      console.error('Alert checker error:', error);
    }
  }, 5 * 60 * 1000);

  // Reset triggered alerts once per day
  setInterval(() => {
    try {
      const resetCount = resetTriggeredAlerts();
      if (resetCount > 0) {
        console.log(`Alert reset: cleared ${resetCount} alerts`);
      }
    } catch (error) {
      console.error('Alert reset error:', error);
    }
  }, 24 * 60 * 60 * 1000);
  
  // Bind to 0.0.0.0 to accept connections from any interface
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Portfolio Tracker API running on http://0.0.0.0:${PORT}`);
    console.log(`   WebSocket: ws://0.0.0.0:${PORT}/ws/prices`);
    console.log(`   Environment: ${env}`);
    console.log(`   Database: ${dbPath}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
