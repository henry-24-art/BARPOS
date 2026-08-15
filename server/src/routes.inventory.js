const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./db');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/inventory - anyone logged in can view their own business's inventory
router.get('/', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(
    'SELECT * FROM inventory_items WHERE businessId = ? ORDER BY category ASC, name ASC',
    [req.user.businessId]
  );
  res.json({ items: rows });
});

// POST /api/inventory - manager+ can add products, subject to the plan's product limit
router.post('/', requireRole('manager'), async (req, res) => {
  const { id: clientId, name, category, price, cost, stockQty, lowStockThreshold, unit, productType } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'name and price are required' });
  }

  const db = getPool();

  const [bizRows] = await db.query('SELECT * FROM businesses WHERE id = ?', [req.user.businessId]);
  const business = bizRows[0];
  if (business && business.subscriptionStatus !== 'active' && business.productLimit != null) {
    const [countRows] = await db.query('SELECT COUNT(*) as count FROM inventory_items WHERE businessId = ?', [req.user.businessId]);
    if (countRows[0].count >= business.productLimit) {
      return res.status(402).json({
        error: `Free trial limit reached (${business.productLimit} products). Contact your administrator to request an upgrade.`,
        code: 'TRIAL_LIMIT_REACHED',
      });
    }
  }

  const id = clientId || uuidv4();
  const now = new Date().toISOString();
  const resolvedProductType = productType || 'beer';
  await db.query(
    `INSERT INTO inventory_items (id, businessId, name, category, price, cost, stockQty, lowStockThreshold, unit, productType, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.businessId, name, category || 'General', price, cost || 0, stockQty || 0, lowStockThreshold || 5, unit || 'unit', resolvedProductType, now, now]
  );

  // A SPIRIT-type product gets a matching spirits ledger row, mirroring localDb.ts
  // on the client - architecture.md section 2.3.
  if (resolvedProductType === 'spirit') {
    await db.query(
      `INSERT INTO spirits (id, businessId, inventoryItemId, brand, bottleSizeMl, shotSizeMl, bottlesInStock, minBottleLevel)
       VALUES (?, ?, ?, ?, 750, 50, ?, 2)`,
      [uuidv4(), req.user.businessId, id, name, stockQty || 0]
    );
  }

  res.status(201).json({ id, name, category, price, cost, stockQty, lowStockThreshold, unit, productType: resolvedProductType, createdAt: now, updatedAt: now });
});

// PUT /api/inventory/:id - manager+ can edit, scoped to their own business
router.put('/:id', requireRole('manager'), async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM inventory_items WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  const existing = rows[0];
  if (!existing) return res.status(404).json({ error: 'Item not found' });

  const merged = { ...existing, ...req.body };
  const now = new Date().toISOString();
  await db.query(
    `UPDATE inventory_items SET name=?, category=?, price=?, cost=?, stockQty=?, lowStockThreshold=?, unit=?, productType=?, updatedAt=? WHERE id=? AND businessId=?`,
    [merged.name, merged.category, merged.price, merged.cost, merged.stockQty, merged.lowStockThreshold, merged.unit, merged.productType, now, req.params.id, req.user.businessId]
  );
  res.json({ ok: true });
});

// PATCH /api/inventory/:id/adjust-stock - any logged-in staff can adjust stock, scoped to their business
router.patch('/:id/adjust-stock', async (req, res) => {
  const { delta } = req.body || {};
  if (typeof delta !== 'number') return res.status(400).json({ error: 'delta must be a number' });

  const db = getPool();
  const now = new Date().toISOString();
  await db.query(
    'UPDATE inventory_items SET stockQty = stockQty + ?, updatedAt = ? WHERE id = ? AND businessId = ?',
    [delta, now, req.params.id, req.user.businessId]
  );
  res.json({ ok: true });
});

// DELETE /api/inventory/:id - manager+ can delete, scoped to their business
router.delete('/:id', requireRole('manager'), async (req, res) => {
  const db = getPool();
  await db.query('DELETE FROM inventory_items WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  res.json({ ok: true });
});

module.exports = router;
