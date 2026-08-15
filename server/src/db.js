const mysql = require('mysql2/promise');

let pool;

/**
 * Connection is configured via either a single DATABASE_URL
 * (mysql://user:pass@host:port/dbname) or individual DB_HOST / DB_PORT /
 * DB_USER / DB_PASSWORD / DB_NAME env vars - whichever your MySQL host
 * gives you. Most managed MySQL providers (PandaStack, PlanetScale, etc.)
 * give you one or the other.
 */
function getPool() {
  if (pool) return pool;

  if (process.env.DATABASE_URL) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      decimalNumbers: true, // return DECIMAL columns as JS numbers, not strings
      waitForConnections: true,
      connectionLimit: 10,
    });
  } else {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
      decimalNumbers: true,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  return pool;
}

async function initSchema() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      businessType VARCHAR(60) NOT NULL DEFAULT 'Other',
      subscriptionStatus ENUM('trial','active','expired') NOT NULL DEFAULT 'trial',
      productLimit INT DEFAULT 200,
      trialStartedAt VARCHAR(30) NOT NULL,
      subscriptionActivatedAt VARCHAR(30),
      createdAt VARCHAR(30) NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS subscription_requests (
      id VARCHAR(36) PRIMARY KEY,
      businessId VARCHAR(36) NOT NULL,
      note VARCHAR(500),
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      requestedAt VARCHAR(30) NOT NULL,
      resolvedAt VARCHAR(30),
      INDEX idx_sub_requests_status (status)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id VARCHAR(36) PRIMARY KEY,
      businessId VARCHAR(36),
      name VARCHAR(120) NOT NULL,
      username VARCHAR(60) NOT NULL UNIQUE,
      passwordHash VARCHAR(255) NOT NULL,
      role ENUM('admin','manager','cashier','waiter','kitchen') NOT NULL DEFAULT 'waiter',
      isPlatformAdmin TINYINT(1) NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      createdAt VARCHAR(30) NOT NULL,
      INDEX idx_staff_businessId (businessId)
    )
  `);

  // Module-gating flags read by both the client nav and (see requireModule in
  // middleware.js) the restaurant-module routes below - architecture.md section 1.
  await db.query(`
    CREATE TABLE IF NOT EXISTS business_settings (
      businessId VARCHAR(36) PRIMARY KEY,
      restaurantEnabled TINYINT(1) NOT NULL DEFAULT 0,
      spiritTrackingEnabled TINYINT(1) NOT NULL DEFAULT 1,
      tableManagementEnabled TINYINT(1) NOT NULL DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id VARCHAR(36) PRIMARY KEY,
      businessId VARCHAR(36) NOT NULL,
      name VARCHAR(160) NOT NULL,
      category VARCHAR(80) NOT NULL DEFAULT 'General',
      price DECIMAL(12,2) NOT NULL DEFAULT 0,
      cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      stockQty DECIMAL(12,2) NOT NULL DEFAULT 0,
      lowStockThreshold DECIMAL(12,2) NOT NULL DEFAULT 5,
      unit VARCHAR(40) NOT NULL DEFAULT 'unit',
      productType ENUM('beer','spirit','wine','soft_drink','food','ingredient') NOT NULL DEFAULT 'beer',
      createdAt VARCHAR(30) NOT NULL,
      updatedAt VARCHAR(30) NOT NULL,
      INDEX idx_inventory_businessId (businessId)
    )
  `);

  // Table lifecycle per architecture.md section 3.3 - status is driven by the
  // linked tab's status server-side (see routes.tables.js), not set freely by clients.
  await db.query(`
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id VARCHAR(36) PRIMARY KEY,
      businessId VARCHAR(36) NOT NULL,
      label VARCHAR(60) NOT NULL,
      status ENUM('available','order_in_progress','active_order','awaiting_payment') NOT NULL DEFAULT 'available',
      currentTabId VARCHAR(36),
      INDEX idx_tables_businessId (businessId)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tabs (
      id VARCHAR(36) PRIMARY KEY,
      businessId VARCHAR(36) NOT NULL,
      token VARCHAR(60) NOT NULL,
      customerName VARCHAR(160),
      status ENUM('open','closed') NOT NULL DEFAULT 'open',
      openedAt VARCHAR(30) NOT NULL,
      closedAt VARCHAR(30),
      paymentMethod VARCHAR(30),
      total DECIMAL(12,2),
      openedByStaffId VARCHAR(36),
      tableId VARCHAR(36),
      INDEX idx_status (status),
      INDEX idx_tabs_businessId (businessId)
    )
  `);

  // route/status turn tab_items into architecture.md's order_items - see the
  // new->accepted->preparing->ready->delivered pipeline in routes.tabs.js.
  await db.query(`
    CREATE TABLE IF NOT EXISTS tab_items (
      id VARCHAR(36) PRIMARY KEY,
      tabId VARCHAR(36) NOT NULL,
      inventoryItemId VARCHAR(36) NOT NULL,
      itemName VARCHAR(160) NOT NULL,
      unitPrice DECIMAL(12,2) NOT NULL,
      quantity DECIMAL(12,2) NOT NULL,
      addedAt VARCHAR(30) NOT NULL,
      route ENUM('bar','kitchen') NOT NULL DEFAULT 'bar',
      status ENUM('new','accepted','preparing','ready','delivered') NOT NULL DEFAULT 'new',
      productType VARCHAR(30) NOT NULL DEFAULT 'beer',
      INDEX idx_tab_items_tabId (tabId),
      INDEX idx_tab_items_route_status (route, status)
    )
  `);

  // Spirit ledger per architecture.md section 2.3 - one row per SPIRIT-type product.
  await db.query(`
    CREATE TABLE IF NOT EXISTS spirits (
      id VARCHAR(36) PRIMARY KEY,
      businessId VARCHAR(36) NOT NULL,
      inventoryItemId VARCHAR(36) NOT NULL,
      brand VARCHAR(120),
      bottleSizeMl DECIMAL(10,2) NOT NULL DEFAULT 750,
      shotSizeMl DECIMAL(10,2) NOT NULL DEFAULT 50,
      bottlesInStock DECIMAL(10,3) NOT NULL DEFAULT 0,
      minBottleLevel DECIMAL(10,3) NOT NULL DEFAULT 2,
      INDEX idx_spirits_businessId (businessId)
    )
  `);

  // Append-only. Remaining volume is always derived from this table server-side too
  // (see routes.spirits.js) so the client-computed figure always has a ground truth.
  await db.query(`
    CREATE TABLE IF NOT EXISTS spirit_transactions (
      id VARCHAR(36) PRIMARY KEY,
      spiritId VARCHAR(36) NOT NULL,
      type ENUM('sale','restock','adjustment') NOT NULL,
      volumeMl DECIMAL(10,2) NOT NULL,
      tabItemId VARCHAR(36),
      note VARCHAR(255),
      createdAt VARCHAR(30) NOT NULL,
      INDEX idx_spirit_transactions_spiritId (spiritId, createdAt)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS spirit_stock_checks (
      id VARCHAR(36) PRIMARY KEY,
      spiritId VARCHAR(36) NOT NULL,
      expectedVolumeMl DECIMAL(10,2) NOT NULL,
      actualVolumeMl DECIMAL(10,2) NOT NULL,
      differenceMl DECIMAL(10,2) NOT NULL,
      note VARCHAR(255),
      createdAt VARCHAR(30) NOT NULL,
      INDEX idx_spirit_stock_checks_spiritId (spiritId)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(36) PRIMARY KEY,
      businessId VARCHAR(36) NOT NULL,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      createdAt VARCHAR(30) NOT NULL,
      INDEX idx_expenses_businessId (businessId, createdAt)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(36) PRIMARY KEY,
      businessId VARCHAR(36) NOT NULL,
      tabId VARCHAR(36) NOT NULL,
      token VARCHAR(60) NOT NULL,
      customerName VARCHAR(160),
      paymentMethod VARCHAR(30) NOT NULL,
      subtotal DECIMAL(12,2) NOT NULL,
      total DECIMAL(12,2) NOT NULL,
      closedAt VARCHAR(30) NOT NULL,
      cashierStaffId VARCHAR(36),
      INDEX idx_sales_closedAt (closedAt),
      INDEX idx_sales_businessId (businessId)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id VARCHAR(36) PRIMARY KEY,
      saleId VARCHAR(36) NOT NULL,
      inventoryItemId VARCHAR(36) NOT NULL,
      itemName VARCHAR(160) NOT NULL,
      unitPrice DECIMAL(12,2) NOT NULL,
      quantity DECIMAL(12,2) NOT NULL,
      lineTotal DECIMAL(12,2) NOT NULL,
      INDEX idx_sale_items_saleId (saleId)
    )
  `);

  // Forward-compatible migrations for databases that already had these tables
  // before the restaurant-module columns existed. CREATE TABLE IF NOT EXISTS
  // above won't add columns to an existing table, so add them individually and
  // ignore "duplicate column" (MySQL error 1060) / "duplicate key" (1061) errors.
  const migrations = [
    "ALTER TABLE staff MODIFY COLUMN role ENUM('admin','manager','cashier','waiter','kitchen') NOT NULL DEFAULT 'waiter'",
    "ALTER TABLE inventory_items ADD COLUMN productType ENUM('beer','spirit','wine','soft_drink','food','ingredient') NOT NULL DEFAULT 'beer'",
    'ALTER TABLE tabs ADD COLUMN tableId VARCHAR(36)',
    "ALTER TABLE tab_items ADD COLUMN route ENUM('bar','kitchen') NOT NULL DEFAULT 'bar'",
    "ALTER TABLE tab_items ADD COLUMN status ENUM('new','accepted','preparing','ready','delivered') NOT NULL DEFAULT 'new'",
    "ALTER TABLE tab_items ADD COLUMN productType VARCHAR(30) NOT NULL DEFAULT 'beer'",
    'ALTER TABLE tab_items ADD INDEX idx_tab_items_route_status (route, status)',
  ];
  for (const sql of migrations) {
    try {
      await db.query(sql);
    } catch (err) {
      if (err.errno !== 1060 && err.errno !== 1061) throw err;
    }
  }
}

module.exports = { getPool, initSchema };
