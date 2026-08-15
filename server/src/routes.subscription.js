const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./db');
const { requireAuth, requireRole, requirePlatformAdmin } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/subscription/status - the caller's own business subscription info
router.get('/status', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM businesses WHERE id = ?', [req.user.businessId]);
  if (!rows[0]) return res.status(404).json({ error: 'Business not found' });

  const business = rows[0];
  let productCount = 0;
  if (business.productLimit != null) {
    const [countRows] = await db.query('SELECT COUNT(*) as count FROM inventory_items WHERE businessId = ?', [req.user.businessId]);
    productCount = countRows[0].count;
  }

  res.json({ business, productCount });
});

// POST /api/subscription/request-upgrade - admin only, creates a pending request for the platform owner to review
// body: { note? }  (e.g. "Paid MWK 50,000 via Airtel Money, ref #12345")
router.post('/request-upgrade', requireRole('admin'), async (req, res) => {
  const { note } = req.body || {};
  const db = getPool();

  const id = uuidv4();
  const now = new Date().toISOString();
  await db.query(
    'INSERT INTO subscription_requests (id, businessId, note, status, requestedAt) VALUES (?, ?, ?, \'pending\', ?)',
    [id, req.user.businessId, note || null, now]
  );
  res.status(201).json({ id, status: 'pending', requestedAt: now });
});

// --- Platform-owner-only routes below (you, not a business admin) ---

// GET /api/subscription/platform/requests?status=pending
router.get('/platform/requests', requirePlatformAdmin, async (req, res) => {
  const db = getPool();
  const status = req.query.status || 'pending';
  const [rows] = await db.query(
    `SELECT sr.*, b.name as businessName, b.businessType, b.subscriptionStatus
     FROM subscription_requests sr JOIN businesses b ON b.id = sr.businessId
     WHERE sr.status = ? ORDER BY sr.requestedAt ASC`,
    [status]
  );
  res.json({ requests: rows });
});

// GET /api/subscription/platform/businesses - list every business on the platform
router.get('/platform/businesses', requirePlatformAdmin, async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM businesses ORDER BY createdAt DESC');
  res.json({ businesses: rows });
});

// POST /api/subscription/platform/requests/:id/approve
router.post('/platform/requests/:id/approve', requirePlatformAdmin, async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM subscription_requests WHERE id = ?', [req.params.id]);
  const request = rows[0];
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const now = new Date().toISOString();
  await db.query('UPDATE subscription_requests SET status = \'approved\', resolvedAt = ? WHERE id = ?', [now, req.params.id]);
  await db.query(
    'UPDATE businesses SET subscriptionStatus = \'active\', productLimit = NULL, subscriptionActivatedAt = ? WHERE id = ?',
    [now, request.businessId]
  );
  res.json({ ok: true });
});

// POST /api/subscription/platform/requests/:id/reject
router.post('/platform/requests/:id/reject', requirePlatformAdmin, async (req, res) => {
  const db = getPool();
  const now = new Date().toISOString();
  await db.query('UPDATE subscription_requests SET status = \'rejected\', resolvedAt = ? WHERE id = ?', [now, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
