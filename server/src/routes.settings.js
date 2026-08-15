const express = require('express');
const { getPool } = require('./db');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const DEFAULTS = { restaurantEnabled: false, spiritTrackingEnabled: true, tableManagementEnabled: false };

// GET /api/settings
router.get('/', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM business_settings WHERE businessId = ?', [req.user.businessId]);
  const row = rows[0];
  res.json({
    settings: row
      ? {
          restaurantEnabled: !!row.restaurantEnabled,
          spiritTrackingEnabled: !!row.spiritTrackingEnabled,
          tableManagementEnabled: !!row.tableManagementEnabled,
        }
      : DEFAULTS,
  });
});

// PUT /api/settings - manager+ only, body: partial BusinessSettings
router.put('/', requireRole('manager'), async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM business_settings WHERE businessId = ?', [req.user.businessId]);
  const current = rows[0]
    ? {
        restaurantEnabled: !!rows[0].restaurantEnabled,
        spiritTrackingEnabled: !!rows[0].spiritTrackingEnabled,
        tableManagementEnabled: !!rows[0].tableManagementEnabled,
      }
    : DEFAULTS;
  const next = { ...current, ...req.body };

  await db.query(
    `INSERT INTO business_settings (businessId, restaurantEnabled, spiritTrackingEnabled, tableManagementEnabled)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE restaurantEnabled = VALUES(restaurantEnabled), spiritTrackingEnabled = VALUES(spiritTrackingEnabled), tableManagementEnabled = VALUES(tableManagementEnabled)`,
    [req.user.businessId, next.restaurantEnabled ? 1 : 0, next.spiritTrackingEnabled ? 1 : 0, next.tableManagementEnabled ? 1 : 0]
  );
  res.json({ settings: next });
});

module.exports = router;
