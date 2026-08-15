import { getLocalDb, replaceLocalTable, setLocalBusinessMeta } from './localDb';
import { getIsOnline, subscribeOnlineStatus } from './netStatus';
import { apiRequest, isServerConfigured, ApiError } from '../api/client';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let state: SyncState = { status: 'idle', pendingCount: 0, lastSyncedAt: null, lastError: null };
const listeners = new Set<(s: SyncState) => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function subscribeSyncState(listener: (s: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getSyncState(): SyncState {
  return state;
}

/** Sends one queued mutation to the server. Maps outbox "kind" to an API call. */
async function sendOutboxItem(kind: string, payload: any): Promise<void> {
  switch (kind) {
    case 'createInventoryItem':
      await apiRequest('/api/inventory', { method: 'POST', body: payload });
      return;
    case 'updateInventoryItem':
      await apiRequest(`/api/inventory/${payload.id}`, { method: 'PUT', body: payload.data });
      return;
    case 'adjustStock':
      await apiRequest(`/api/inventory/${payload.id}/adjust-stock`, {
        method: 'PATCH',
        body: { delta: payload.delta },
      });
      return;
    case 'deleteInventoryItem':
      await apiRequest(`/api/inventory/${payload.id}`, { method: 'DELETE' });
      return;
    case 'openTab':
      await apiRequest('/api/tabs', {
        method: 'POST',
        body: { id: payload.id, token: payload.token, customerName: payload.customerName },
      });
      return;
    case 'addTabItem':
      await apiRequest(`/api/tabs/${payload.tabId}/items`, {
        method: 'POST',
        body: { id: payload.id, inventoryItemId: payload.inventoryItemId, quantity: payload.quantity },
      });
      return;
    case 'removeTabItem':
      await apiRequest(`/api/tabs/items/${payload.tabItemId}`, { method: 'DELETE' });
      return;
    case 'checkoutTab':
      await apiRequest(`/api/tabs/${payload.tabId}/checkout`, {
        method: 'POST',
        body: { paymentMethod: payload.paymentMethod, saleId: payload.saleId, closedAt: payload.closedAt },
      });
      return;
    case 'cancelTab':
      await apiRequest(`/api/tabs/${payload.tabId}`, { method: 'DELETE' });
      return;
    case 'updateTabItemStatus':
      await apiRequest(`/api/tabs/items/${payload.id}/status`, { method: 'PATCH', body: { status: payload.status } });
      return;
    case 'createTable':
      await apiRequest('/api/tables', { method: 'POST', body: payload });
      return;
    case 'deleteTable':
      await apiRequest(`/api/tables/${payload.id}`, { method: 'DELETE' });
      return;
    case 'recordSpiritTransaction':
      await apiRequest('/api/spirits/transactions', { method: 'POST', body: payload });
      return;
    case 'restockSpirit':
      await apiRequest(`/api/spirits/${payload.spiritId}/restock`, { method: 'POST', body: payload });
      return;
    case 'recordSpiritStockCheck':
      await apiRequest(`/api/spirits/${payload.spiritId}/stock-check`, { method: 'POST', body: payload });
      return;
    case 'addExpense':
      await apiRequest('/api/expenses', { method: 'POST', body: payload });
      return;
    case 'deleteExpense':
      await apiRequest(`/api/expenses/${payload.id}`, { method: 'DELETE' });
      return;
    case 'updateBusinessSettings':
      await apiRequest('/api/settings', { method: 'PUT', body: payload });
      return;
    default:
      throw new Error(`Unknown outbox kind: ${kind}`);
  }
}

/** True for errors that will never succeed no matter how many times we retry (stale reference, etc). */
function isPermanentError(err: any): boolean {
  if (!(err instanceof ApiError)) return false;
  // 402 (trial limit reached) is NOT permanent in the "drop and forget" sense - it needs
  // to surface to the user, not vanish silently. Treat it as a stop-and-report case instead.
  if (err.status === 402) return false;
  return err.status >= 400 && err.status < 500;
}

interface DrainResult {
  fullyDrained: boolean;
  trialLimitError: string | null;
}

/** Pushes every queued local change to the server, oldest first. Stops on the first network-level failure. */
async function drainOutbox(): Promise<DrainResult> {
  const db = await getLocalDb();
  let fullyDrained = true;
  let trialLimitError: string | null = null;

  while (true) {
    const row = await db.getFirstAsync<{ id: string; kind: string; payload: string; attempts: number }>(
      'SELECT * FROM outbox ORDER BY createdAt ASC LIMIT 1'
    );
    if (!row) break;

    try {
      const payload = JSON.parse(row.payload);
      await sendOutboxItem(row.kind, payload);
      await db.runAsync('DELETE FROM outbox WHERE id = ?', [row.id]);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 402) {
        // Trial limit reached - stop draining so this (and anything queued after it) stays
        // visibly pending rather than silently disappearing. Surfaced via sync status.
        trialLimitError = err.message;
        fullyDrained = false;
        break;
      }
      if (isPermanentError(err)) {
        // This change can never succeed (e.g. tab already closed elsewhere) - drop it rather
        // than block every change behind it forever, but keep a record of what happened.
        console.warn(`Dropping unsyncable outbox item (${row.kind}):`, err.message);
        await db.runAsync('DELETE FROM outbox WHERE id = ?', [row.id]);
        continue;
      }
      // Network-level or server-down error - stop here and retry the whole queue next time.
      await db.runAsync('UPDATE outbox SET attempts = attempts + 1, lastError = ? WHERE id = ?', [
        String(err.message || err),
        row.id,
      ]);
      fullyDrained = false;
      break;
    }
  }

  return { fullyDrained, trialLimitError };
}

/** Pulls fresh server state into the local cache. Only safe to call after the outbox is fully drained. */
async function pullLatest(): Promise<void> {
  const [inventoryRes, openTabsRes, salesExportRes, subscriptionRes, settingsRes, tablesRes, spiritsRes, expensesRes] =
    await Promise.all([
      apiRequest<{ items: any[] }>('/api/inventory'),
      apiRequest<{ tabs: any[] }>('/api/tabs/open'),
      apiRequest<{ sales: any[]; saleItems: any[] }>('/api/sales/export?limit=500'),
      apiRequest<{ business: any }>('/api/subscription/status'),
      apiRequest<{ settings: any }>('/api/settings').catch(() => ({ settings: null })),
      apiRequest<{ tables: any[] }>('/api/tables').catch(() => ({ tables: [] })),
      apiRequest<{ spirits: any[] }>('/api/spirits').catch(() => ({ spirits: [] })),
      apiRequest<{ expenses: any[] }>('/api/expenses').catch(() => ({ expenses: [] })),
    ]);

  await setLocalBusinessMeta({
    subscriptionStatus: subscriptionRes.business.subscriptionStatus,
    productLimit: subscriptionRes.business.productLimit,
  });

  if (settingsRes.settings) {
    const db = await getLocalDb();
    const s = settingsRes.settings;
    await db.runAsync(
      `UPDATE business_settings SET restaurantEnabled = ?, spiritTrackingEnabled = ?, tableManagementEnabled = ? WHERE id = 'singleton'`,
      [s.restaurantEnabled ? 1 : 0, s.spiritTrackingEnabled ? 1 : 0, s.tableManagementEnabled ? 1 : 0]
    );
  }

  await replaceLocalTable('inventory_items', inventoryRes.items);
  await replaceLocalTable('restaurant_tables', tablesRes.tables);
  await replaceLocalTable('spirits', spiritsRes.spirits);
  await replaceLocalTable('expenses', expensesRes.expenses);

  // Tabs: keep closed tabs already known to just this pull's window untouched by
  // rebuilding from open tabs + closed tabs implied by the sales export (a sale
  // exists for every closed tab, so tab rows tied to those sales are refreshed too).
  const openTabs = openTabsRes.tabs;
  const openTabIds = new Set(openTabs.map((t) => t.id));

  const db = await getLocalDb();
  // Drop any locally-known tab that the server no longer reports as open
  // (it was checked out or cancelled by someone), then reload open tabs + their items fresh.
  await db.runAsync("DELETE FROM tabs WHERE status = 'open'");
  await db.runAsync(
    `DELETE FROM tab_items WHERE tabId NOT IN (SELECT id FROM tabs)`
  );
  for (const tab of openTabs) {
    await db.runAsync(
      `INSERT OR REPLACE INTO tabs (id, token, customerName, status, openedAt, closedAt, paymentMethod, total, tableId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tab.id, tab.token, tab.customerName ?? null, tab.status, tab.openedAt, tab.closedAt ?? null, tab.paymentMethod ?? null, tab.total ?? null, tab.tableId ?? null]
    );
    const itemsRes = await apiRequest<{ items: any[] }>(`/api/tabs/${tab.id}/items`);
    await db.runAsync('DELETE FROM tab_items WHERE tabId = ?', [tab.id]);
    for (const item of itemsRes.items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO tab_items (id, tabId, inventoryItemId, itemName, unitPrice, quantity, addedAt, route, status, productType)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.tabId, item.inventoryItemId, item.itemName, item.unitPrice, item.quantity, item.addedAt, item.route ?? 'bar', item.status ?? 'new', item.productType ?? 'beer']
      );
    }
  }

  await replaceLocalTable('sales', salesExportRes.sales);
  await replaceLocalTable('sale_items', salesExportRes.saleItems);
}

let syncInFlight = false;

export async function runSync(): Promise<void> {
  if (syncInFlight) return;
  if (!isServerConfigured()) return;
  if (!getIsOnline()) {
    setState({ status: 'offline' });
    return;
  }

  syncInFlight = true;
  setState({ status: 'syncing', lastError: null });

  try {
    const { fullyDrained, trialLimitError } = await drainOutbox();
    if (trialLimitError) {
      const count = await countPending();
      setState({ status: 'error', pendingCount: count, lastError: trialLimitError });
    } else if (fullyDrained) {
      await pullLatest();
      setState({ status: 'idle', pendingCount: 0, lastSyncedAt: new Date().toISOString(), lastError: null });
    } else {
      const count = await countPending();
      setState({ status: 'offline', pendingCount: count });
    }
  } catch (err: any) {
    setState({ status: 'error', lastError: String(err.message || err) });
  } finally {
    syncInFlight = false;
  }
}

async function countPending(): Promise<number> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM outbox');
  return row?.count ?? 0;
}

let started = false;
export function startSyncEngine(): void {
  if (started) return;
  started = true;

  subscribeOnlineStatus((online) => {
    if (online) runSync();
    else setState({ status: 'offline' });
  });

  // Safety-net periodic sync while the app is open.
  setInterval(() => runSync(), 45000);

  runSync();
}
