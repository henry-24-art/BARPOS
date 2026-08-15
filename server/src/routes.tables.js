const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./db');
const { requireAuth, requireModule } = require('./auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireModule('tableManagementEnabled'));

// GET /api/tables
router.get('/', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM restaurant_tables WHERE businessId = ? ORDER BY label ASC', [req.user.businessId]);
  res.json({ tables: rows });
});

// POST /api/tables - body: { id?, label }
router.post('/', async (req, res) => {
  const { id: clientId, label } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });

  const db = getPool();
  const id = clientId || uuidv4();
  await db.query(`INSERT INTO restaurant_tables (id, businessId, label, status) VALUES (?, ?, ?, 'available')`, [id, req.user.businessId, label]);
  res.status(201).json({ id, label, status: 'available' });
});

// DELETE /api/tables/:id
router.delete('/:id', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM restaurant_tables WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  const table = rows[0];
  if (table && table.status !== 'available') {
    return res.status(400).json({ error: 'Cannot remove a table with an active order' });
  }
  await db.query('DELETE FROM restaurant_tables WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  res.json({ ok: true });
});

module.exports = router;
