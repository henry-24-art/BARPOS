const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const STATUS_ORDER = ['new', 'accepted', 'preparing', 'ready', 'delivered'];

// Food routes to the kitchen, everything else to the bar - architecture.md section 2.5.
function routeForProductType(productType) {
  return productType === 'food' ? 'kitchen' : 'bar';
}

/**
 * Keeps restaurant_tables.status in sync with the linked tab's lifecycle
 * (architecture.md section 3.3). Mirrors syncTableStatusForTab in the client's tabsApi.ts.
 */
async function syncTableStatusForTab(db, tabId) {
  const [tabRows] = await db.query('SELECT * FROM tabs WHERE id = ?', [tabId]);
  const tab = tabRows[0];
  if (!tab || !tab.tableId) return;

  let nextStatus;
  if (tab.status === 'closed') {
    nextStatus = 'available';
  } else {
    const [[{ count: itemCount }]] = await db.query('SELECT COUNT(*) as count FROM tab_items WHERE tabId = ?', [tabId]);
    const [[{ count: deliveredCount }]] = await db.query(
      "SELECT COUNT(*) as count FROM tab_items WHERE tabId = ? AND status IN ('ready','delivered')",
      [tabId]
    );
    if (itemCount === 0) nextStatus = 'order_in_progress';
    else if (deliveredCount > 0) nextStatus = 'awaiting_payment';
    else nextStatus = 'active_order';
  }

  await db.query('UPDATE restaurant_tables SET status = ?, currentTabId = ? WHERE id = ?', [
    nextStatus,
    tab.status === 'closed' ? null : tabId,
    tab.tableId,
  ]);
}

// GET /api/tabs/open
router.get('/open', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(
    "SELECT * FROM tabs WHERE status = 'open' AND businessId = ? ORDER BY openedAt DESC",
    [req.user.businessId]
  );
  res.json({ tabs: rows });
});

// GET /api/tabs/:id
router.get('/:id', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM tabs WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  if (!rows[0]) return res.status(404).json({ error: 'Tab not found' });
  res.json({ tab: rows[0] });
});

// GET /api/tabs/:id/items
router.get('/:id/items', async (req, res) => {
  const db = getPool();
  const [tabRows] = await db.query('SELECT id FROM tabs WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  if (!tabRows[0]) return res.status(404).json({ error: 'Tab not found' });
  const [rows] = await db.query('SELECT * FROM tab_items WHERE tabId = ? ORDER BY addedAt ASC', [req.params.id]);
  res.json({ items: rows });
});

// GET /api/tabs/queue/:route - bar or kitchen order queue across all open tabs
router.get('/queue/:route', async (req, res) => {
  if (!['bar', 'kitchen'].includes(req.params.route)) {
    return res.status(400).json({ error: 'route must be bar or kitchen' });
  }
  const db = getPool();
  const [rows] = await db.query(
    `SELECT ti.*, t.token as token FROM tab_items ti
     JOIN tabs t ON t.id = ti.tabId
     WHERE ti.route = ? AND t.status = 'open' AND ti.status != 'delivered' AND t.businessId = ?
     ORDER BY ti.addedAt ASC`,
    [req.params.route, req.user.businessId]
  );
  res.json({ items: rows });
});

// POST /api/tabs - open a new tab/order. body: { id?, token, customerName?, tableId? }
router.post('/', async (req, res) => {
  const { id: clientId, token, customerName, tableId } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  const db = getPool();
  const id = clientId || uuidv4();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO tabs (id, businessId, token, customerName, status, openedAt, openedByStaffId, tableId) VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
    [id, req.user.businessId, token, customerName || null, now, req.user.id, tableId || null]
  );
  if (tableId) {
    await db.query('UPDATE restaurant_tables SET status = ?, currentTabId = ? WHERE id = ? AND businessId = ?', [
      'order_in_progress',
      id,
      tableId,
      req.user.businessId,
    ]);
  }
  res.status(201).json({ id, token, customerName, status: 'open', openedAt: now, tableId });
});

// POST /api/tabs/:id/items - add an item to a tab/order. body: { id?, inventoryItemId, quantity }
router.post('/:id/items', async (req, res) => {
  const { id: clientId, inventoryItemId, quantity } = req.body || {};
  if (!inventoryItemId || !quantity) {
    return res.status(400).json({ error: 'inventoryItemId and quantity are required' });
  }

  const db = getPool();
  const [tabRows] = await db.query('SELECT id FROM tabs WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  if (!tabRows[0]) return res.status(404).json({ error: 'Tab not found' });

  const [itemRows] = await db.query('SELECT * FROM inventory_items WHERE id = ? AND businessId = ?', [inventoryItemId, req.user.businessId]);
  const item = itemRows[0];
  if (!item) return res.status(404).json({ error: 'Inventory item not found' });
  if (Number(item.stockQty) < quantity) {
    return res.status(400).json({ error: `Not enough stock for ${item.name}. Only ${item.stockQty} left.` });
  }

  const id = clientId || uuidv4();
  const now = new Date().toISOString();
  // route is derived from product_type server-side too, never trusted from the client -
  // architecture.md section 2.5.
  const route = routeForProductType(item.productType);
  await db.query(
    `INSERT INTO tab_items (id, tabId, inventoryItemId, itemName, unitPrice, quantity, addedAt, route, status, productType)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    [id, req.params.id, inventoryItemId, item.name, item.price, quantity, now, route, item.productType]
  );
  await db.query('UPDATE inventory_items SET stockQty = stockQty - ?, updatedAt = ? WHERE id = ?', [quantity, now, inventoryItemId]);
  await syncTableStatusForTab(db, req.params.id);

  res.status(201).json({ id, tabId: req.params.id, inventoryItemId, itemName: item.name, unitPrice: item.price, quantity, addedAt: now, route, status: 'new', productType: item.productType });
});

// PATCH /api/tabs/items/:tabItemId/status - advance one order item through the prep pipeline
router.patch('/items/:tabItemId/status', async (req, res) => {
  const { status: requestedStatus } = req.body || {};
  const db = getPool();
  const [rows] = await db.query(
    `SELECT ti.* FROM tab_items ti JOIN tabs t ON t.id = ti.tabId WHERE ti.id = ? AND t.businessId = ?`,
    [req.params.tabItemId, req.user.businessId]
  );
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Order item not found' });

  const currentIdx = STATUS_ORDER.indexOf(item.status);
  const nextStatus = requestedStatus && STATUS_ORDER.includes(requestedStatus) ? requestedStatus : STATUS_ORDER[currentIdx + 1];
  if (!nextStatus) return res.json({ ok: true, status: item.status });

  await db.query('UPDATE tab_items SET status = ? WHERE id = ?', [nextStatus, req.params.tabItemId]);

  // Spirit deduction is a side effect of the item reaching 'preparing' (the pour moment),
  // not POS button logic - architecture.md section 3.4. Mirrors recordSpiritSale in spiritsApi.ts.
  if (nextStatus === 'preparing' && item.productType === 'spirit') {
    const [spiritRows] = await db.query('SELECT * FROM spirits WHERE inventoryItemId = ? AND businessId = ?', [item.inventoryItemId, req.user.businessId]);
    const spirit = spiritRows[0];
    if (spirit) {
      const volumeMl = -(Number(spirit.shotSizeMl) * Number(item.quantity));
      await db.query(
        `INSERT INTO spirit_transactions (id, spiritId, type, volumeMl, tabItemId, createdAt) VALUES (?, ?, 'sale', ?, ?, ?)`,
        [uuidv4(), spirit.id, volumeMl, item.id, new Date().toISOString()]
      );
    }
  }

  await syncTableStatusForTab(db, item.tabId);
  res.json({ ok: true, status: nextStatus });
});

// DELETE /api/tabs/items/:tabItemId - remove a line item, restoring stock
router.delete('/items/:tabItemId', async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT ti.* FROM tab_items ti JOIN tabs t ON t.id = ti.tabId WHERE ti.id = ? AND t.businessId = ?`,
    [req.params.tabItemId, req.user.businessId]
  );
  const row = rows[0];
  if (!row) return res.json({ ok: true });

  await db.query('UPDATE inventory_items SET stockQty = stockQty + ? WHERE id = ?', [row.quantity, row.inventoryItemId]);
  await db.query('DELETE FROM tab_items WHERE id = ?', [req.params.tabItemId]);
  await syncTableStatusForTab(db, row.tabId);
  res.json({ ok: true });
});

// POST /api/tabs/:id/checkout - body: { paymentMethod, saleId?, closedAt? }
router.post('/:id/checkout', async (req, res) => {
  const { paymentMethod, saleId: clientSaleId, closedAt: clientClosedAt } = req.body || {};
  if (!paymentMethod) return res.status(400).json({ error: 'paymentMethod is required' });

  const db = getPool();
  const [tabRows] = await db.query('SELECT * FROM tabs WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  const tab = tabRows[0];
  if (!tab) return res.status(404).json({ error: 'Tab not found' });
  if (tab.status === 'closed') return res.status(409).json({ error: 'Tab already checked out' });

  const [items] = await db.query('SELECT * FROM tab_items WHERE tabId = ?', [req.params.id]);
  if (items.length === 0) return res.status(400).json({ error: 'Cannot checkout an empty tab' });

  const total = items.reduce((sum, i) => sum + Number(i.unitPrice) * Number(i.quantity), 0);
  const now = clientClosedAt || new Date().toISOString();
  const saleId = clientSaleId || uuidv4();

  await db.query(
    `INSERT INTO sales (id, businessId, tabId, token, customerName, paymentMethod, subtotal, total, closedAt, cashierStaffId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [saleId, req.user.businessId, tab.id, tab.token, tab.customerName, paymentMethod, total, total, now, req.user.id]
  );

  for (const item of items) {
    await db.query(
      `INSERT INTO sale_items (id, saleId, inventoryItemId, itemName, unitPrice, quantity, lineTotal) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), saleId, item.inventoryItemId, item.itemName, item.unitPrice, item.quantity, Number(item.unitPrice) * Number(item.quantity)]
    );
  }

  await db.query(
    `UPDATE tabs SET status = 'closed', closedAt = ?, paymentMethod = ?, total = ? WHERE id = ?`,
    [now, paymentMethod, total, req.params.id]
  );
  await syncTableStatusForTab(db, req.params.id);

  res.json({ saleId, total, paymentMethod, closedAt: now });
});

// DELETE /api/tabs/:id - cancel a tab, restoring all stock
router.delete('/:id', async (req, res) => {
  const db = getPool();
  const [tabRows] = await db.query('SELECT * FROM tabs WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  if (!tabRows[0]) return res.json({ ok: true });

  const [items] = await db.query('SELECT * FROM tab_items WHERE tabId = ?', [req.params.id]);
  for (const item of items) {
    await db.query('UPDATE inventory_items SET stockQty = stockQty + ? WHERE id = ?', [item.quantity, item.inventoryItemId]);
  }
  await db.query('DELETE FROM tab_items WHERE tabId = ?', [req.params.id]);
  await db.query('DELETE FROM tabs WHERE id = ?', [req.params.id]);
  if (tabRows[0].tableId) {
    await db.query('UPDATE restaurant_tables SET status = ?, currentTabId = NULL WHERE id = ?', ['available', tabRows[0].tableId]);
  }
  res.json({ ok: true });
});

module.exports = router;
