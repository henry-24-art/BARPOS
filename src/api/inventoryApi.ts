import { getLocalDb, generateId, enqueueOutbox, getLocalBusinessMeta } from '../offline/localDb';
import { runSync } from '../offline/syncEngine';
import { InventoryItem } from '../types';

export async function getAllInventory(): Promise<InventoryItem[]> {
  const db = await getLocalDb();
  return db.getAllAsync<InventoryItem>('SELECT * FROM inventory_items ORDER BY category ASC, name ASC');
}

export async function createInventoryItem(
  data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>
): Promise<InventoryItem> {
  const db = await getLocalDb();

  const meta = await getLocalBusinessMeta();
  if (meta && meta.subscriptionStatus === 'trial' && meta.productLimit != null) {
    const countRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM inventory_items');
    if ((countRow?.count ?? 0) >= meta.productLimit) {
      throw new Error(
        `Free trial limit reached (${meta.productLimit} products). Contact your administrator to request an upgrade.`
      );
    }
  }

  const id = generateId();
  const now = new Date().toISOString();
  const productType = data.productType ?? 'beer';
  await db.runAsync(
    `INSERT INTO inventory_items (id, name, category, price, cost, stockQty, lowStockThreshold, unit, productType, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.category, data.price, data.cost, data.stockQty, data.lowStockThreshold, data.unit, productType, now, now]
  );
  await enqueueOutbox('createInventoryItem', { id, ...data, productType });
  runSync();

  // A SPIRIT-type product gets a matching spirits ledger row so it shows up in
  // the Spirits screen immediately - see architecture.md section 2.3.
  if (productType === 'spirit') {
    await db.runAsync(
      `INSERT INTO spirits (id, inventoryItemId, brand, bottleSizeMl, shotSizeMl, bottlesInStock, minBottleLevel)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), id, data.name, 750, 50, data.stockQty ?? 0, 2]
    );
  }

  return { ...data, id, productType, createdAt: now, updatedAt: now };
}

export async function updateInventoryItem(
  id: string,
  data: Partial<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const db = await getLocalDb();
  const existing = await db.getFirstAsync<InventoryItem>('SELECT * FROM inventory_items WHERE id = ?', [id]);
  if (!existing) throw new Error('Item not found');
  const merged = { ...existing, ...data };
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE inventory_items SET name=?, category=?, price=?, cost=?, stockQty=?, lowStockThreshold=?, unit=?, productType=?, updatedAt=? WHERE id=?`,
    [merged.name, merged.category, merged.price, merged.cost, merged.stockQty, merged.lowStockThreshold, merged.unit, merged.productType, now, id]
  );
  await enqueueOutbox('updateInventoryItem', { id, data: merged });
  runSync();
}

export async function adjustStock(id: string, delta: number): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db.runAsync('UPDATE inventory_items SET stockQty = stockQty + ?, updatedAt = ? WHERE id = ?', [delta, now, id]);
  await enqueueOutbox('adjustStock', { id, delta });
  runSync();
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync('DELETE FROM inventory_items WHERE id = ?', [id]);
  await enqueueOutbox('deleteInventoryItem', { id });
  runSync();
}

export async function getLowStockItems(): Promise<InventoryItem[]> {
  const db = await getLocalDb();
  return db.getAllAsync<InventoryItem>('SELECT * FROM inventory_items WHERE stockQty <= lowStockThreshold ORDER BY stockQty ASC');
}
