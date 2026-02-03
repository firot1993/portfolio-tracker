import { Router } from 'express';
import { query, run, lastInsertId, saveDB } from '../db/index.js';

const router = Router();

// Get all transactions
router.get('/', (req, res) => {
  const { asset_id, account_id, limit = 100 } = req.query;
  
  let sql = `
    SELECT t.*, a.symbol as asset_symbol, a.name as asset_name, a.type as asset_type,
           acc.name as account_name
    FROM transactions t
    JOIN assets a ON t.asset_id = a.id
    LEFT JOIN accounts acc ON t.account_id = acc.id
    WHERE 1=1
  `;
  const params: any[] = [];
  
  if (asset_id) {
    sql += ' AND t.asset_id = ?';
    params.push(Number(asset_id));
  }
  if (account_id) {
    sql += ' AND t.account_id = ?';
    params.push(Number(account_id));
  }
  
  sql += ' ORDER BY t.date DESC LIMIT ?';
  params.push(Number(limit));
  
  const transactions = query(sql, params);
  res.json(transactions);
});

// Add transaction and update holdings
router.post('/', (req, res) => {
  const { asset_id, account_id, type, quantity, price, fee = 0, date, notes } = req.body;
  
  if (!asset_id || !type || !quantity || !price || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (quantity <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than 0' });
  }
  
  if (price < 0) {
    return res.status(400).json({ error: 'Price cannot be negative' });
  }
  
  if (fee < 0) {
    return res.status(400).json({ error: 'Fee cannot be negative' });
  }
  
  if (!['buy', 'sell', 'transfer_in', 'transfer_out'].includes(type)) {
    return res.status(400).json({ error: 'Invalid transaction type' });
  }
  
  // Insert transaction
  run(
    `INSERT INTO transactions (asset_id, account_id, type, quantity, price, fee, date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [asset_id, account_id || null, type, quantity, price, fee, date, notes || null]
  );
  const transactionId = lastInsertId();
  
  // Update holdings
  const existing = query(
    'SELECT * FROM holdings WHERE asset_id = ? AND (account_id = ? OR (account_id IS NULL AND ? IS NULL))',
    [asset_id, account_id || null, account_id || null]
  )[0] as any;
  
  if (type === 'buy' || type === 'transfer_in') {
    if (existing) {
      const newQty = existing.quantity + quantity;
      const newAvgCost = (existing.avg_cost * existing.quantity + price * quantity) / newQty;
      run(
        `UPDATE holdings SET quantity = ?, avg_cost = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [newQty, newAvgCost, existing.id]
      );
    } else {
      run(
        'INSERT INTO holdings (asset_id, account_id, quantity, avg_cost) VALUES (?, ?, ?, ?)',
        [asset_id, account_id || null, quantity, price]
      );
    }
  } else if (type === 'sell' || type === 'transfer_out') {
    if (existing) {
      const newQty = existing.quantity - quantity;
      if (newQty <= 0) {
        run('DELETE FROM holdings WHERE id = ?', [existing.id]);
      } else {
        run(
          `UPDATE holdings SET quantity = ?, updated_at = datetime('now') WHERE id = ?`,
          [newQty, existing.id]
        );
      }
    }
  }
  
  saveDB();
  const transaction = query('SELECT * FROM transactions WHERE id = ?', [transactionId])[0];
  res.status(201).json(transaction);
});

// Update transaction
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { type, quantity, price, fee, date, notes } = req.body;
  
  run(
    `UPDATE transactions 
     SET type = COALESCE(?, type),
         quantity = COALESCE(?, quantity),
         price = COALESCE(?, price),
         fee = COALESCE(?, fee),
         date = COALESCE(?, date),
         notes = COALESCE(?, notes)
     WHERE id = ?`,
    [type, quantity, price, fee, date, notes, Number(id)]
  );
  saveDB();
  
  const transaction = query('SELECT * FROM transactions WHERE id = ?', [Number(id)])[0];
  res.json(transaction);
});

// Delete transaction
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    // Get transaction details before deleting
    const transaction = query('SELECT * FROM transactions WHERE id = ?', [Number(id)])[0] as any;
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Reverse update holdings
    const existing = query(
      'SELECT * FROM holdings WHERE asset_id = ? AND (account_id = ? OR (account_id IS NULL AND ? IS NULL))',
      [transaction.asset_id, transaction.account_id || null, transaction.account_id || null]
    )[0] as any;
      if (existing) {
        if (transaction.type === 'buy' || transaction.type === 'transfer_in') {
          // Reverse buy/transfer_in: decrease quantity
          const newQty = existing.quantity - transaction.quantity;
          if (newQty <= 0) {
            run('DELETE FROM holdings WHERE id = ?', [existing.id]);
          } else {
            // Recalculate average cost
            const totalCost = existing.avg_cost * existing.quantity - transaction.price * transaction.quantity;
            const newAvgCost = totalCost / newQty;
            run(
              `UPDATE holdings SET quantity = ?, avg_cost = ?, updated_at = datetime('now')
               WHERE id = ?`,
              [newQty, newAvgCost, existing.id]
            );
          }
        } else if (transaction.type === 'sell' || transaction.type === 'transfer_out') {
          // Reverse sell/transfer_out: increase quantity
          // Note: We can't accurately reconstruct the average cost after a sell
          // So we keep the existing average cost and just add back the quantity
          const newQty = existing.quantity + transaction.quantity;
          run(
            `UPDATE holdings SET quantity = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [newQty, existing.id]
          );
        }
      }
    
    // Delete transaction
    run('DELETE FROM transactions WHERE id = ?', [Number(id)]);
    saveDB();
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;
