import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getLocalDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync('stockmate_local.db');
  await dbInstance.execAsync('PRAGMA journal_mode = WAL;');
  await dbInstance.execAsync('PRAGMA foreign_keys = ON;');
  return dbInstance;
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Local cache mirrors the server schema, plus an "outbox" table of pending
 * mutations that haven't reached the server yet. This is what makes the app
 * work fully offline: every screen reads/writes this local database, and a
 * background sync engine drains the outbox to the server whenever a
 * connection is available.
 */
export async function initLocalSchema(): Promise<void> {
  const db = await getLocalDb();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      price REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      stockQty REAL NOT NULL DEFAULT 0,
      lowStockThreshold REAL NOT NULL DEFAULT 5,
      unit TEXT NOT NULL DEFAULT 'unit',
      productType TEXT NOT NULL DEFAULT 'beer',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tabs (
      id TEXT PRIMARY KEY NOT NULL,
      token TEXT NOT NULL,
      customerName TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      openedAt TEXT NOT NULL,
      closedAt TEXT,
      paymentMethod TEXT,
      total REAL,
      tableId TEXT
    );

    -- route/status turn tab_items into architecture.md's order_items: route is derived
    -- from the product's productType at insert time (never chosen by staff), status is
    -- the new->accepted->preparing->ready->delivered prep pipeline (section 3.1).
    CREATE TABLE IF NOT EXISTS tab_items (
      id TEXT PRIMARY KEY NOT NULL,
      tabId TEXT NOT NULL,
      inventoryItemId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      unitPrice REAL NOT NULL,
      quantity REAL NOT NULL,
      addedAt TEXT NOT NULL,
      route TEXT NOT NULL DEFAULT 'bar',
      status TEXT NOT NULL DEFAULT 'new',
      productType TEXT NOT NULL DEFAULT 'beer'
    );

    -- Table lifecycle (section 3.3) - status is driven by the linked tab's
    -- lifecycle from the API layer, not set directly by the UI.
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      currentTabId TEXT
    );

    -- Spirit tracking (section 2.3). One row per SPIRIT-type inventory item.
    CREATE TABLE IF NOT EXISTS spirits (
      id TEXT PRIMARY KEY NOT NULL,
      inventoryItemId TEXT NOT NULL,
      brand TEXT,
      bottleSizeMl REAL NOT NULL DEFAULT 750,
      shotSizeMl REAL NOT NULL DEFAULT 50,
      bottlesInStock REAL NOT NULL DEFAULT 0,
      minBottleLevel REAL NOT NULL DEFAULT 2
    );

    -- Append-only ledger. Remaining volume is always derived from this table,
    -- never stored/edited directly - see spiritsApi.getSpiritRemainingMl.
    CREATE TABLE IF NOT EXISTS spirit_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      spiritId TEXT NOT NULL,
      type TEXT NOT NULL,
      volumeMl REAL NOT NULL,
      tabItemId TEXT,
      note TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spirit_stock_checks (
      id TEXT PRIMARY KEY NOT NULL,
      spiritId TEXT NOT NULL,
      expectedVolumeMl REAL NOT NULL,
      actualVolumeMl REAL NOT NULL,
      differenceMl REAL NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      createdAt TEXT NOT NULL
    );

    -- Single-row cache of module-gating flags (architecture.md section 1).
    CREATE TABLE IF NOT EXISTS business_settings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton',
      restaurantEnabled INTEGER NOT NULL DEFAULT 0,
      spiritTrackingEnabled INTEGER NOT NULL DEFAULT 1,
      tableManagementEnabled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY NOT NULL,
      tabId TEXT NOT NULL,
      token TEXT NOT NULL,
      customerName TEXT,
      paymentMethod TEXT NOT NULL,
      subtotal REAL NOT NULL,
      total REAL NOT NULL,
      closedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY NOT NULL,
      saleId TEXT NOT NULL,
      inventoryItemId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      unitPrice REAL NOT NULL,
      quantity REAL NOT NULL,
      lineTotal REAL NOT NULL
    );

    -- Pending changes not yet confirmed by the server.
    -- "kind" identifies which server endpoint to call; "payload" is the
    -- JSON body to send. Processed oldest-first, deleted once confirmed.
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT
    );

    -- Single-row cache of this business's subscription status, refreshed on
    -- every sync, so the trial product limit can be checked instantly even
    -- while offline (rather than only discovering the limit was hit when a
    -- queued change finally reaches the server).
    CREATE TABLE IF NOT EXISTS business_meta (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton',
      subscriptionStatus TEXT NOT NULL DEFAULT 'trial',
      productLimit INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tab_items_tabId ON tab_items(tabId);
    CREATE INDEX IF NOT EXISTS idx_sale_items_saleId ON sale_items(saleId);
    CREATE INDEX IF NOT EXISTS idx_outbox_createdAt ON outbox(createdAt);
  `);

  // Forward-compatible migration for installs that already created the tables above
  // before these columns existed - CREATE TABLE IF NOT EXISTS won't add columns to an
  // existing table, so add them individually and ignore "duplicate column" errors.
  const migrations: [string, string][] = [
    ['inventory_items', "ADD COLUMN productType TEXT NOT NULL DEFAULT 'beer'"],
    ['tabs', 'ADD COLUMN tableId TEXT'],
    ['tab_items', "ADD COLUMN route TEXT NOT NULL DEFAULT 'bar'"],
    ['tab_items', "ADD COLUMN status TEXT NOT NULL DEFAULT 'new'"],
    ['tab_items', "ADD COLUMN productType TEXT NOT NULL DEFAULT 'beer'"],
  ];
  for (const [table, clause] of migrations) {
    try {
      await db.execAsync(`ALTER TABLE ${table} ${clause};`);
    } catch {
      // Column already exists - fine.
    }
  }

  // These two indexes reference columns that only exist after the migration above runs
  // (on an upgrade from a pre-restaurant-module install), so they must come after it -
  // creating them earlier, alongside the other CREATE TABLE/INDEX statements, fails with
  // "no such column: route" on any device that already had a tab_items table.
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_tab_items_route_status ON tab_items(route, status);
    CREATE INDEX IF NOT EXISTS idx_spirit_transactions_spiritId ON spirit_transactions(spiritId, createdAt);
  `);

  const settingsRow = await db.getFirstAsync('SELECT id FROM business_settings WHERE id = ?', ['singleton']);
  if (!settingsRow) {
    await db.runAsync(
      'INSERT INTO business_settings (id, restaurantEnabled, spiritTrackingEnabled, tableManagementEnabled) VALUES (?, 0, 1, 0)',
      ['singleton']
    );
  }
}

export async function enqueueOutbox(kind: string, payload: any): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    'INSERT INTO outbox (id, kind, payload, createdAt, attempts) VALUES (?, ?, ?, ?, 0)',
    [generateId(), kind, JSON.stringify(payload), new Date().toISOString()]
  );
}

export async function getOutboxCount(): Promise<number> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM outbox');
  return row?.count ?? 0;
}

export interface BusinessMeta {
  subscriptionStatus: 'trial' | 'active' | 'expired';
  productLimit: number | null;
}

export async function setLocalBusinessMeta(meta: BusinessMeta): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO business_meta (id, subscriptionStatus, productLimit) VALUES (?, ?, ?)',
    ['singleton', meta.subscriptionStatus, meta.productLimit]
  );
}

export async function getLocalBusinessMeta(): Promise<BusinessMeta | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<BusinessMeta>('SELECT * FROM business_meta WHERE id = ?', ['singleton']);
  return row ?? null;
}

/** Wipes and reloads local tables from a fresh server snapshot (used after a successful pull). */
export async function replaceLocalTable(table: string, rows: any[]): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`DELETE FROM ${table}`);
  for (const row of rows) {
    const keys = Object.keys(row);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => row[k]);
    await db.runAsync(
      `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }
}
