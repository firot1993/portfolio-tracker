import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initDB, getEnvInfo } from './db/index.js';
import accountsRouter from './routes/accounts.js';
import assetsRouter from './routes/assets.js';
import transactionsRouter from './routes/transactions.js';
import holdingsRouter from './routes/holdings.js';
import portfolioRouter from './routes/portfolio.js';
import historyRouter from './routes/history.js';
import { initWebSocketServer } from './routes/ws.js';
import { realtimePriceService } from './services/realtimePriceService.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/history', historyRouter);

// Health check (including WebSocket status)
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

// Realtime price service stats
app.get('/api/realtime/stats', (req, res) => {
  res.json(realtimePriceService.getStats());
});

// Initialize DB then start server
initDB().then(async () => {
  const { env, dbPath } = getEnvInfo();
  
  // Create HTTP server
  const server = createServer(app);
  
  // Initialize WebSocket server
  initWebSocketServer(server);
  
  // Start realtime price service
  realtimePriceService.start();
  
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
