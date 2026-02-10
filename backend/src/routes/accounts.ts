import { Router } from 'express';
import { query, run, lastInsertId, saveDB, beginTransaction, commitTransaction, rollbackTransaction } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Get all accounts
router.get('/', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const accounts = query(
    'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  res.json(accounts);
});

// Create account
router.post('/', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { name, type, currency = 'USD' } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }

  run(
    'INSERT INTO accounts (user_id, name, type, currency) VALUES (?, ?, ?, ?)',
    [userId, name, type, currency]
  );
  saveDB();

  const id = lastInsertId();
  const account = query('SELECT * FROM accounts WHERE id = ?', [id])[0];
  res.status(201).json(account);
});

// Update account
router.put('/:id', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, type, currency } = req.body;

  // Verify ownership
  const existing = query('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [id, userId]);
  if (existing.length === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }

  run(
    'UPDATE accounts SET name = ?, type = ?, currency = ? WHERE id = ? AND user_id = ?',
    [name, type, currency, id, userId]
  );
  saveDB();

  const account = query('SELECT * FROM accounts WHERE id = ?', [id])[0];
  res.json(account);
});

// Delete account
router.delete('/:id', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  // Verify ownership
  const existing = query('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [id, userId]);
  if (existing.length === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Delete related holdings and transactions first
  run('DELETE FROM holdings WHERE account_id = ?', [id]);
  run('DELETE FROM transactions WHERE account_id = ?', [id]);

  run('DELETE FROM accounts WHERE id = ? AND user_id = ?', [id, userId]);
  saveDB();

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

  beginTransaction();
  try {
    for (const acc of demoAccounts) {
      run(
        'INSERT INTO accounts (user_id, name, type, currency) VALUES (?, ?, ?, ?)',
        [userId, acc.name, acc.type, acc.currency]
      );
    }
    commitTransaction();
    saveDB();

    const accounts = query(
      'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    res.json(accounts);
  } catch (error) {
    rollbackTransaction();
    throw error;
  }
});

export default router;
