import { Router } from 'express';
import { eq, and, desc, isNull, or, sql } from 'drizzle-orm';
import { getDB, getSqliteDB, transactions, assets, accounts, holdings } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Get all transactions
router.get('/', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { asset_id, account_id, limit = 100 } = req.query;

  const db = getDB();

  // Build conditions
  const conditions = [eq(transactions.userId, userId)];

  if (asset_id) {
    conditions.push(eq(transactions.assetId, Number(asset_id)));
  }
  if (account_id) {
    conditions.push(eq(transactions.accountId, Number(account_id)));
  }

  const txnList = db.select({
    id: transactions.id,
    userId: transactions.userId,
    assetId: transactions.assetId,
    accountId: transactions.accountId,
    type: transactions.type,
    quantity: transactions.quantity,
    price: transactions.price,
    fee: transactions.fee,
    date: transactions.date,
    notes: transactions.notes,
    createdAt: transactions.createdAt,
    asset_symbol: assets.symbol,
    asset_name: assets.name,
    asset_type: assets.type,
    account_name: accounts.name,
  })
    .from(transactions)
    .innerJoin(assets, eq(transactions.assetId, assets.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date))
    .limit(Number(limit))
    .all();

  res.json(txnList);
});

// Add transaction and update holdings
router.post('/', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
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

  const db = getDB();
  const sqliteDb = getSqliteDB();

  // Verify asset exists (assets are global)
  const assetCheck = db.select({ id: assets.id })
    .from(assets)
    .where(eq(assets.id, asset_id))
    .get();

  if (!assetCheck) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  let insertedTxn: any;

  const insertOp = sqliteDb.transaction(() => {
    // Insert transaction
    insertedTxn = db.insert(transactions)
      .values({
        userId,
        assetId: asset_id,
        accountId: account_id || null,
        type,
        quantity,
        price,
        fee,
        date,
        notes: notes || null,
      })
      .returning()
      .get();

    // Update holdings
    const accountCondition = account_id
      ? eq(holdings.accountId, account_id)
      : isNull(holdings.accountId);

    const existing = db.select()
      .from(holdings)
      .where(and(
        eq(holdings.assetId, asset_id),
        accountCondition,
        eq(holdings.userId, userId)
      ))
      .get();

    if (type === 'buy' || type === 'transfer_in') {
      if (existing) {
        const newQty = existing.quantity + quantity;
        const newAvgCost = (existing.avgCost * existing.quantity + price * quantity) / newQty;
        db.update(holdings)
          .set({
            quantity: newQty,
            avgCost: newAvgCost,
            updatedAt: sql`datetime('now')`,
          })
          .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
          .run();
      } else {
        db.insert(holdings)
          .values({
            userId,
            assetId: asset_id,
            accountId: account_id || null,
            quantity,
            avgCost: price,
          })
          .run();
      }
    } else if (type === 'sell' || type === 'transfer_out') {
      if (existing) {
        const newQty = existing.quantity - quantity;
        if (newQty <= 0) {
          db.delete(holdings)
            .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
            .run();
        } else {
          db.update(holdings)
            .set({
              quantity: newQty,
              updatedAt: sql`datetime('now')`,
            })
            .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
            .run();
        }
      }
    }
  });

  insertOp();
  res.status(201).json(insertedTxn);
});

// Update transaction
router.put('/:id', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { type, quantity, price, fee, date, notes } = req.body;

  const db = getDB();

  // Verify ownership
  const existing = db.select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, Number(id)), eq(transactions.userId, userId)))
    .get();

  if (!existing) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  // Build update object with only provided fields
  const updateData: Record<string, any> = {};
  if (type !== undefined) updateData.type = type;
  if (quantity !== undefined) updateData.quantity = quantity;
  if (price !== undefined) updateData.price = price;
  if (fee !== undefined) updateData.fee = fee;
  if (date !== undefined) updateData.date = date;
  if (notes !== undefined) updateData.notes = notes;

  const updated = db.update(transactions)
    .set(updateData)
    .where(and(eq(transactions.id, Number(id)), eq(transactions.userId, userId)))
    .returning()
    .get();

  res.json(updated);
});

// Delete transaction
router.delete('/:id', authMiddleware, (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  const db = getDB();
  const sqliteDb = getSqliteDB();

  try {
    // Get transaction details before deleting
    const txn = db.select()
      .from(transactions)
      .where(and(eq(transactions.id, Number(id)), eq(transactions.userId, userId)))
      .get();

    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const deleteOp = sqliteDb.transaction(() => {
      // Reverse update holdings
      const accountCondition = txn.accountId
        ? eq(holdings.accountId, txn.accountId)
        : isNull(holdings.accountId);

      const existing = db.select()
        .from(holdings)
        .where(and(
          eq(holdings.assetId, txn.assetId!),
          accountCondition,
          eq(holdings.userId, userId)
        ))
        .get();

      if (existing) {
        if (txn.type === 'buy' || txn.type === 'transfer_in') {
          // Reverse buy/transfer_in: decrease quantity
          const newQty = existing.quantity - txn.quantity;
          if (newQty <= 0) {
            db.delete(holdings)
              .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
              .run();
          } else {
            // Recalculate average cost
            const totalCost = existing.avgCost * existing.quantity - txn.price * txn.quantity;
            const newAvgCost = totalCost / newQty;
            db.update(holdings)
              .set({
                quantity: newQty,
                avgCost: newAvgCost,
                updatedAt: sql`datetime('now')`,
              })
              .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
              .run();
          }
        } else if (txn.type === 'sell' || txn.type === 'transfer_out') {
          // Reverse sell/transfer_out: increase quantity
          const newQty = existing.quantity + txn.quantity;
          db.update(holdings)
            .set({
              quantity: newQty,
              updatedAt: sql`datetime('now')`,
            })
            .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
            .run();
        }
      }

      // Delete transaction
      db.delete(transactions)
        .where(and(eq(transactions.id, Number(id)), eq(transactions.userId, userId)))
        .run();
    });

    deleteOp();
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;
