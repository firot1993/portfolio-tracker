import { Router } from 'express';
import { query, run, lastInsertId, saveDB } from '../db/index.js';

const router = Router();

// Get all accounts
router.get('/', (req, res) => {
  const accounts = query('SELECT * FROM accounts ORDER BY created_at DESC');
  res.json(accounts);
});

// Create account
router.post('/', (req, res) => {
  const { name, type, currency = 'USD' } = req.body;
  
  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }
  
  run('INSERT INTO accounts (name, type, currency) VALUES (?, ?, ?)', [name, type, currency]);
  saveDB();
  
  const id = lastInsertId();
  const account = query('SELECT * FROM accounts WHERE id = ?', [id])[0];
  res.status(201).json(account);
});

// Delete account
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  run('DELETE FROM accounts WHERE id = ?', [Number(id)]);
  saveDB();
  res.status(204).send();
});

export default router;
