const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/expenses
router.get('/', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM expenses WHERE businessId = ? ORDER BY createdAt DESC LIMIT 500', [req.user.businessId]);
  res.json({ expenses: rows });
});

// POST /api/expenses - body: { id?, description, amount, createdAt? }
router.post('/', async (req, res) => {
  const { id: clientId, description, amount, createdAt: clientCreatedAt } = req.body || {};
  if (!description || amount === undefined) {
    return res.status(400).json({ error: 'description and amount are required' });
  }
  const db = getPool();
  const id = clientId || uuidv4();
  const now = clientCreatedAt || new Date().toISOString();
  await db.query('INSERT INTO expenses (id, businessId, description, amount, createdAt) VALUES (?, ?, ?, ?, ?)', [
    id,
    req.user.businessId,
    description,
    amount,
    now,
  ]);
  res.status(201).json({ id, description, amount, createdAt: now });
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  const db = getPool();
  await db.query('DELETE FROM expenses WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  res.json({ ok: true });
});

module.exports = router;
