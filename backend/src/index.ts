import express from 'express';
import cors from 'cors';
import { initDB, getEnvInfo } from './db/index.js';
import accountsRouter from './routes/accounts.js';
import assetsRouter from './routes/assets.js';
import transactionsRouter from './routes/transactions.js';
import holdingsRouter from './routes/holdings.js';
import portfolioRouter from './routes/portfolio.js';
import historyRouter from './routes/history.js';
import { recordDailySnapshot } from './services/priceHistoryService.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/history', historyRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize DB then start server
initDB().then(async () => {
  const { env, dbPath } = getEnvInfo();
  
  // Try to record a daily snapshot on startup
  try {
    await recordDailySnapshot();
  } catch (err) {
    console.error('Failed to record daily snapshot on startup:', err);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Portfolio Tracker API running on http://localhost:${PORT}`);
    console.log(`   Environment: ${env}`);
    console.log(`   Database: ${dbPath}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
