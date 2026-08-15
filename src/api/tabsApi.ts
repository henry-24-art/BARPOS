import { getLocalDb, generateId, enqueueOutbox } from '../offline/localDb';
import { runSync } from '../offline/syncEngine';
import { Tab, TabItem, PaymentMethod, OrderItemStatus, ProductModule, moduleForProductType } from '../types';
import { adjustStock } from './inventoryApi';
import { recordSpiritSale } from './spiritsApi';

/**
 * Keeps restaurant_tables.status in sync with the linked tab's lifecycle
 * (architecture.md section 3.3). Lives here rather than in tablesApi.ts to
 * avoid a circular import, since tablesApi.ts opens tabs via this module.
 */
async function syncTableStatusForTab(tabId: string): Promise<void> {
  const db = await getLocalDb();
  const tab = await db.getFirstAsync<any>('SELECT * FROM tabs WHERE id = ?', [tabId]);
  if (!tab?.tableId) return;

  let nextStatus: string;
  if (tab.status === 'closed') {
    nextStatus = 'available';
  } else {
    const itemCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM tab_items WHERE tabId = ?',
      [tabId]
    );
    const anyDelivered = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM tab_items WHERE tabId = ? AND status IN ('ready','delivered')",
      [tabId]
    );
    if ((itemCount?.count ?? 0) === 0) nextStatus = 'order_in_progress';
    else if ((anyDelivered?.count ?? 0) > 0) nextStatus = 'awaiting_payment';
    else nextStatus = 'active_order';
  }

  await db.runAsync('UPDATE restaurant_tables SET status = ?, currentTabId = ? WHERE id = ?', [
    nextStatus,
    tab.status === 'closed' ? null : tabId,
    tab.tableId,
  ]);
}

export async function getOpenTabs(): Promise<Tab[]> {
  const db = await getLocalDb();
  return db.getAllAsync<Tab>("SELECT * FROM tabs WHERE status = 'open' ORDER BY openedAt DESC");
}

export async function getTab(id: string): Promise<Tab | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<Tab>('SELECT * FROM tabs WHERE id = ?', [id]);
  return row ?? null;
}

export async function openTab(token: string, customerName?: string, tableId?: string): Promise<Tab> {
  const db = await getLocalDb();
  const id = generateId();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO tabs (id, token, customerName, status, openedAt, tableId) VALUES (?, ?, ?, 'open', ?, ?)`,
    [id, token, customerName ?? null, now, tableId ?? null]
  );
  await enqueueOutbox('openTab', { id, token, customerName, tableId });
  if (tableId) {
    await db.runAsync('UPDATE restaurant_tables SET status = ?, currentTabId = ? WHERE id = ?', [
      'order_in_progress',
      id,
      tableId,
    ]);
  }
  runSync();
  return { id, token, customerName, status: 'open', openedAt: now, tableId };
}

export async function getTabItems(tabId: string): Promise<TabItem[]> {
  const db = await getLocalDb();
  return db.getAllAsync<TabItem>('SELECT * FROM tab_items WHERE tabId = ? ORDER BY addedAt ASC', [tabId]);
}

export async function addItemToTab(tabId: string, inventoryItemId: string, quantity: number): Promise<void> {
  const db = await getLocalDb();
  const item = await db.getFirstAsync<any>('SELECT * FROM inventory_items WHERE id = ?', [inventoryItemId]);
  if (!item) throw new Error('Inventory item not found');
  if (item.stockQty < quantity) {
    throw new Error(`Not enough stock for ${item.name}. Only ${item.stockQty} left.`);
  }

  const id = generateId();
  const now = new Date().toISOString();
  // route is derived from product_type here, at insert time - never chosen by staff
  // (architecture.md section 2.5 / "structural, not conditional logic sprinkled through the code").
  const route: ProductModule = moduleForProductType(item.productType);
  await db.runAsync(
    `INSERT INTO tab_items (id, tabId, inventoryItemId, itemName, unitPrice, quantity, addedAt, route, status, productType)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    [id, tabId, inventoryItemId, item.name, item.price, quantity, now, route, item.productType]
  );
  await db.runAsync('UPDATE inventory_items SET stockQty = stockQty - ? WHERE id = ?', [quantity, inventoryItemId]);

  await enqueueOutbox('addTabItem', { id, tabId, inventoryItemId, quantity, route, productType: item.productType });
  await syncTableStatusForTab(tabId);
  runSync();
}

/** Bar or kitchen queue: every open item of a given route, oldest first, across all open tabs. */
export async function getQueueItems(route: ProductModule): Promise<(TabItem & { token: string })[]> {
  const db = await getLocalDb();
  return db.getAllAsync<TabItem & { token: string }>(
    `SELECT ti.*, t.token as token FROM tab_items ti
     JOIN tabs t ON t.id = ti.tabId
     WHERE ti.route = ? AND t.status = 'open' AND ti.status != 'delivered'
     ORDER BY ti.addedAt ASC`,
    [route]
  );
}

const STATUS_ORDER: OrderItemStatus[] = ['new', 'accepted', 'preparing', 'ready', 'delivered'];

/** Advances one order item to the next state in the new->accepted->preparing->ready->delivered pipeline. */
export async function advanceTabItemStatus(tabItemId: string): Promise<void> {
  const db = await getLocalDb();
  const item = await db.getFirstAsync<TabItem>('SELECT * FROM tab_items WHERE id = ?', [tabItemId]);
  if (!item) throw new Error('Order item not found');
  const idx = STATUS_ORDER.indexOf(item.status);
  if (idx === -1 || idx === STATUS_ORDER.length - 1) return;
  const nextStatus = STATUS_ORDER[idx + 1];

  await db.runAsync('UPDATE tab_items SET status = ? WHERE id = ?', [nextStatus, tabItemId]);
  await enqueueOutbox('updateTabItemStatus', { id: tabItemId, status: nextStatus });

  // Spirit deduction is a side effect of the item reaching 'preparing' (the pour moment),
  // not POS button logic - architecture.md section 3.4.
  if (nextStatus === 'preparing' && item.productType === 'spirit') {
    await recordSpiritSale(item.inventoryItemId, item.quantity, tabItemId);
  }

  await syncTableStatusForTab(item.tabId);
  runSync();
}

export async function removeTabItem(tabItemId: string): Promise<void> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<TabItem>('SELECT * FROM tab_items WHERE id = ?', [tabItemId]);
  if (!row) return;
  await db.runAsync('UPDATE inventory_items SET stockQty = stockQty + ? WHERE id = ?', [row.quantity, row.inventoryItemId]);
  await db.runAsync('DELETE FROM tab_items WHERE id = ?', [tabItemId]);
  await enqueueOutbox('removeTabItem', { tabItemId });
  runSync();
}

export async function getTabTotal(tabId: string): Promise<number> {
  const items = await getTabItems(tabId);
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

export async function checkoutTab(tabId: string, paymentMethod: PaymentMethod): Promise<void> {
  const db = await getLocalDb();
  const tab = await getTab(tabId);
  if (!tab) throw new Error('Tab not found');

  const items = await getTabItems(tabId);
  if (items.length === 0) throw new Error('Cannot checkout an empty tab');

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const now = new Date().toISOString();
  const saleId = generateId();

  await db.runAsync(
    `INSERT INTO sales (id, tabId, token, customerName, paymentMethod, subtotal, total, closedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [saleId, tab.id, tab.token, tab.customerName ?? null, paymentMethod, total, total, now]
  );
  for (const item of items) {
    await db.runAsync(
      `INSERT INTO sale_items (id, saleId, inventoryItemId, itemName, unitPrice, quantity, lineTotal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), saleId, item.inventoryItemId, item.itemName, item.unitPrice, item.quantity, item.unitPrice * item.quantity]
    );
  }
  await db.runAsync(`UPDATE tabs SET status = 'closed', closedAt = ?, paymentMethod = ?, total = ? WHERE id = ?`, [
    now,
    paymentMethod,
    total,
    tabId,
  ]);

  await enqueueOutbox('checkoutTab', { tabId, paymentMethod, saleId, closedAt: now });
  await syncTableStatusForTab(tabId);
  runSync();
}

export async function cancelTab(tabId: string): Promise<void> {
  const db = await getLocalDb();
  const items = await getTabItems(tabId);
  for (const item of items) {
    await db.runAsync('UPDATE inventory_items SET stockQty = stockQty + ? WHERE id = ?', [item.quantity, item.inventoryItemId]);
  }
  const tab = await db.getFirstAsync<any>('SELECT * FROM tabs WHERE id = ?', [tabId]);
  await db.runAsync('DELETE FROM tab_items WHERE tabId = ?', [tabId]);
  await db.runAsync('DELETE FROM tabs WHERE id = ?', [tabId]);
  if (tab?.tableId) {
    await db.runAsync('UPDATE restaurant_tables SET status = ?, currentTabId = NULL WHERE id = ?', [
      'available',
      tab.tableId,
    ]);
  }
  await enqueueOutbox('cancelTab', { tabId });
  runSync();
}
