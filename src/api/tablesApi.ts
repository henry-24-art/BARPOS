import { getLocalDb, generateId, enqueueOutbox } from '../offline/localDb';
import { runSync } from '../offline/syncEngine';
import { RestaurantTable } from '../types';
import { openTab } from './tabsApi';

export async function getTables(): Promise<RestaurantTable[]> {
  const db = await getLocalDb();
  return db.getAllAsync<RestaurantTable>('SELECT * FROM restaurant_tables ORDER BY label ASC');
}

export async function createTable(label: string): Promise<RestaurantTable> {
  const db = await getLocalDb();
  const id = generateId();
  await db.runAsync(`INSERT INTO restaurant_tables (id, label, status) VALUES (?, ?, 'available')`, [id, label]);
  await enqueueOutbox('createTable', { id, label });
  runSync();
  return { id, label, status: 'available' };
}

export async function deleteTable(id: string): Promise<void> {
  const db = await getLocalDb();
  const table = await db.getFirstAsync<RestaurantTable>('SELECT * FROM restaurant_tables WHERE id = ?', [id]);
  if (table?.status !== 'available') {
    throw new Error('Cannot remove a table with an active order');
  }
  await db.runAsync('DELETE FROM restaurant_tables WHERE id = ?', [id]);
  await enqueueOutbox('deleteTable', { id });
  runSync();
}

/** Opens a new order (tab) for a table, e.g. when a waiter seats a party. Table status flips to order_in_progress. */
export async function openTableOrder(tableId: string, tableLabel: string, customerName?: string) {
  const db = await getLocalDb();
  const table = await db.getFirstAsync<RestaurantTable>('SELECT * FROM restaurant_tables WHERE id = ?', [tableId]);
  if (!table) throw new Error('Table not found');
  if (table.status !== 'available') throw new Error('Table already has an active order');

  const tab = await openTab(tableLabel, customerName, tableId);
  return tab;
}
