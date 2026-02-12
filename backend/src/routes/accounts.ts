import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDB, getSqliteDB, accounts, holdings, transactions } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Get all accounts
router.get('/', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const db = getDB();

  const result = db.select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(desc(accounts.createdAt))
    .all();

  res.json(result);
});

// Create account
router.post('/', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { name, type, currency = 'USD' } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }

  const db = getDB();

  const account = db.insert(accounts)
    .values({ userId, name, type, currency })
    .returning()
    .get();

  res.status(201).json(account);
});

// Update account
router.put('/:id', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, type, currency } = req.body;
  const accountId = parseInt(id);

  const db = getDB();

  // Verify ownership
  const existing = db.select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .get();

  if (!existing) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const updated = db.update(accounts)
    .set({ name, type, currency })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .returning()
    .get();

  res.json(updated);
});

// Delete account
router.delete('/:id', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const accountId = parseInt(id);

  const db = getDB();
  const sqliteDb = getSqliteDB();

  // Verify ownership
  const existing = db.select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .get();

  if (!existing) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Delete related holdings, transactions, and account in a transaction
  const deleteOp = sqliteDb.transaction(() => {
    db.delete(holdings).where(eq(holdings.accountId, accountId)).run();
    db.delete(transactions).where(eq(transactions.accountId, accountId)).run();
    db.delete(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId))).run();
  });

  deleteOp();

  res.json({ message: 'Account deleted successfully' });
});

// Seed demo accounts (for testing)
router.post('/seed', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const demoAccounts = [
    { name: 'Main Brokerage', type: 'brokerage', currency: 'USD' },
    { name: 'Crypto Wallet', type: 'wallet', currency: 'USD' },
    { name: 'Savings', type: 'savings', currency: 'USD' },
  ];

  const db = getDB();
  const sqliteDb = getSqliteDB();

  const seedOp = sqliteDb.transaction(() => {
    for (const acc of demoAccounts) {
      db.insert(accounts)
        .values({ userId, name: acc.name, type: acc.type, currency: acc.currency })
        .run();
    }
  });

  seedOp();

  const result = db.select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(desc(accounts.createdAt))
    .all();

  res.json(result);
});

export default router;
