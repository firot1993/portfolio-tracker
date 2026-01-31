import express from 'express';
import cors from 'cors';
import { initDB } from './db/index.js';
import accountsRouter from './routes/accounts.js';
import assetsRouter from './routes/assets.js';
import transactionsRouter from './routes/transactions.js';
import holdingsRouter from './routes/holdings.js';
import portfolioRouter from './routes/portfolio.js';

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize DB then start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Portfolio Tracker API running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
