const express = require('express');
const { getPool } = require('./db');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/sales/today-summary
router.get('/today-summary', async (req, res) => {
  const db = getPool();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [rows] = await db.query("SELECT * FROM sales WHERE closedAt LIKE CONCAT(?, '%') AND businessId = ?", [todayStr, req.user.businessId]);

  const summary = {
    date: todayStr,
    totalSales: 0,
    totalTransactions: rows.length,
    cashTotal: 0,
    cardTotal: 0,
    mobileMoneyTotal: 0,
  };
  for (const sale of rows) {
    const total = Number(sale.total);
    summary.totalSales += total;
    if (sale.paymentMethod === 'cash') summary.cashTotal += total;
    else if (sale.paymentMethod === 'card') summary.cardTotal += total;
    else if (sale.paymentMethod === 'mobile_money') summary.mobileMoneyTotal += total;
  }
  res.json({ summary });
});

// GET /api/sales/recent?limit=50
router.get('/recent', async (req, res) => {
  const db = getPool();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const [rows] = await db.query('SELECT * FROM sales WHERE businessId = ? ORDER BY closedAt DESC LIMIT ?', [req.user.businessId, limit]);
  res.json({ sales: rows });
});

// GET /api/sales/top-items?limit=10
router.get('/top-items', async (req, res) => {
  const db = getPool();
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const [rows] = await db.query(
    `SELECT si.itemName, SUM(si.quantity) as totalQty, SUM(si.lineTotal) as totalRevenue
     FROM sale_items si JOIN sales s ON s.id = si.saleId
     WHERE s.businessId = ?
     GROUP BY si.itemName ORDER BY totalRevenue DESC LIMIT ?`,
    [req.user.businessId, limit]
  );
  res.json({ items: rows });
});

// GET /api/sales/staff-performance - manager+ only
router.get('/staff-performance', requireRole('manager'), async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT s.cashierStaffId, st.name, COUNT(*) as transactions, SUM(s.total) as totalSales
     FROM sales s
     LEFT JOIN staff st ON st.id = s.cashierStaffId
     WHERE s.cashierStaffId IS NOT NULL AND s.businessId = ?
     GROUP BY s.cashierStaffId, st.name
     ORDER BY totalSales DESC`,
    [req.user.businessId]
  );
  res.json({ performance: rows });
});

// GET /api/sales/export?limit=500 - full sales + line items, for the offline local cache
router.get('/export', async (req, res) => {
  const db = getPool();
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const [sales] = await db.query('SELECT * FROM sales WHERE businessId = ? ORDER BY closedAt DESC LIMIT ?', [req.user.businessId, limit]);
  const saleIds = sales.map((s) => s.id);
  let saleItems = [];
  if (saleIds.length > 0) {
    const placeholders = saleIds.map(() => '?').join(', ');
    const [rows] = await db.query(`SELECT * FROM sale_items WHERE saleId IN (${placeholders})`, saleIds);
    saleItems = rows;
  }
  res.json({ sales, saleItems });
});

module.exports = router;
