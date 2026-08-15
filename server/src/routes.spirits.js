const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./db');
const { requireAuth, requireModule } = require('./auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireModule('spiritTrackingEnabled'));

async function getRemainingMl(db, spirit) {
  const [[{ total }]] = await db.query('SELECT COALESCE(SUM(volumeMl), 0) as total FROM spirit_transactions WHERE spiritId = ?', [spirit.id]);
  return Number(spirit.bottlesInStock) * Number(spirit.bottleSizeMl) + Number(total);
}

// GET /api/spirits - includes derived remainingMl per spirit (never stored directly)
router.get('/', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT s.*, i.name as name FROM spirits s JOIN inventory_items i ON i.id = s.inventoryItemId WHERE s.businessId = ? ORDER BY i.name ASC`,
    [req.user.businessId]
  );
  const spirits = [];
  for (const row of rows) {
    const remainingMl = await getRemainingMl(db, row);
    spirits.push({ ...row, remainingMl, lowStock: remainingMl <= Number(row.minBottleLevel) * Number(row.bottleSizeMl) });
  }
  res.json({ spirits });
});

// GET /api/spirits/:id/transactions
router.get('/:id/transactions', async (req, res) => {
  const db = getPool();
  const [spiritRows] = await db.query('SELECT id FROM spirits WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  if (!spiritRows[0]) return res.status(404).json({ error: 'Spirit not found' });
  const [rows] = await db.query('SELECT * FROM spirit_transactions WHERE spiritId = ? ORDER BY createdAt DESC', [req.params.id]);
  res.json({ transactions: rows });
});

// POST /api/spirits/transactions - client-authored ledger entries sync through here (rare; most
// entries are written server-side by routes.tabs.js on the 'preparing' status transition)
router.post('/transactions', async (req, res) => {
  const { id: clientId, spiritId, type, volumeMl, tabItemId, note, createdAt } = req.body || {};
  if (!spiritId || !type || volumeMl === undefined) {
    return res.status(400).json({ error: 'spiritId, type, and volumeMl are required' });
  }
  const db = getPool();
  const [spiritRows] = await db.query('SELECT id FROM spirits WHERE id = ? AND businessId = ?', [spiritId, req.user.businessId]);
  if (!spiritRows[0]) return res.status(404).json({ error: 'Spirit not found' });

  const id = clientId || uuidv4();
  const now = createdAt || new Date().toISOString();
  await db.query(
    `INSERT INTO spirit_transactions (id, spiritId, type, volumeMl, tabItemId, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, spiritId, type, volumeMl, tabItemId || null, note || null, now]
  );
  res.status(201).json({ id });
});

// POST /api/spirits/:id/restock - body: { bottles, note? }
router.post('/:id/restock', async (req, res) => {
  const { bottles, note } = req.body || {};
  if (bottles === undefined) return res.status(400).json({ error: 'bottles is required' });

  const db = getPool();
  const [rows] = await db.query('SELECT * FROM spirits WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  const spirit = rows[0];
  if (!spirit) return res.status(404).json({ error: 'Spirit not found' });

  await db.query('UPDATE spirits SET bottlesInStock = bottlesInStock + ? WHERE id = ?', [bottles, req.params.id]);
  const now = new Date().toISOString();
  const volumeMl = bottles * Number(spirit.bottleSizeMl);
  await db.query(
    `INSERT INTO spirit_transactions (id, spiritId, type, volumeMl, note, createdAt) VALUES (?, ?, 'restock', ?, ?, ?)`,
    [uuidv4(), req.params.id, volumeMl, note || null, now]
  );
  res.json({ ok: true });
});

// POST /api/spirits/:id/stock-check - body: { actualVolumeMl, note? }
router.post('/:id/stock-check', async (req, res) => {
  const { actualVolumeMl, note } = req.body || {};
  if (actualVolumeMl === undefined) return res.status(400).json({ error: 'actualVolumeMl is required' });

  const db = getPool();
  const [rows] = await db.query('SELECT * FROM spirits WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  const spirit = rows[0];
  if (!spirit) return res.status(404).json({ error: 'Spirit not found' });

  const expectedVolumeMl = await getRemainingMl(db, spirit);
  const differenceMl = actualVolumeMl - expectedVolumeMl;
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.query(
    `INSERT INTO spirit_stock_checks (id, spiritId, expectedVolumeMl, actualVolumeMl, differenceMl, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, expectedVolumeMl, actualVolumeMl, differenceMl, note || null, now]
  );
  await db.query(
    `INSERT INTO spirit_transactions (id, spiritId, type, volumeMl, note, createdAt) VALUES (?, ?, 'adjustment', ?, ?, ?)`,
    [uuidv4(), req.params.id, differenceMl, note || 'Stock check adjustment', now]
  );

  res.status(201).json({ id, expectedVolumeMl, actualVolumeMl, differenceMl });
});

module.exports = router;
