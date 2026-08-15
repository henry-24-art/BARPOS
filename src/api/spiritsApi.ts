import { getLocalDb, generateId, enqueueOutbox } from '../offline/localDb';
import { runSync } from '../offline/syncEngine';
import { Spirit, SpiritTransaction, SpiritStockCheck } from '../types';

export interface SpiritWithStatus extends Spirit {
  name: string;
  remainingMl: number;
  lowStock: boolean;
}

/**
 * Remaining volume is never stored directly - it's always derived from
 * bottlesInStock x bottleSizeMl + SUM(spirit_transactions.volumeMl), per the
 * ledger design in architecture.md section 2.3. This avoids race conditions
 * when two bartenders sell from the same spirit at once.
 */
export async function getSpirits(): Promise<SpiritWithStatus[]> {
  const db = await getLocalDb();
  const spirits = await db.getAllAsync<any>(
    `SELECT s.*, i.name as name FROM spirits s JOIN inventory_items i ON i.id = s.inventoryItemId ORDER BY i.name ASC`
  );
  const result: SpiritWithStatus[] = [];
  for (const s of spirits) {
    const remainingMl = await getSpiritRemainingMl(s.id, s);
    const minMl = s.minBottleLevel * s.bottleSizeMl;
    result.push({ ...s, remainingMl, lowStock: remainingMl <= minMl });
  }
  return result;
}

export async function getSpiritRemainingMl(spiritId: string, preloaded?: Spirit): Promise<number> {
  const db = await getLocalDb();
  const spirit = preloaded ?? (await db.getFirstAsync<Spirit>('SELECT * FROM spirits WHERE id = ?', [spiritId]));
  if (!spirit) return 0;
  const sumRow = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(volumeMl), 0) as total FROM spirit_transactions WHERE spiritId = ?',
    [spiritId]
  );
  return spirit.bottlesInStock * spirit.bottleSizeMl + (sumRow?.total ?? 0);
}

export async function getSpiritTransactions(spiritId: string): Promise<SpiritTransaction[]> {
  const db = await getLocalDb();
  return db.getAllAsync<SpiritTransaction>(
    'SELECT * FROM spirit_transactions WHERE spiritId = ? ORDER BY createdAt DESC',
    [spiritId]
  );
}

/** Called automatically when a SPIRIT order item starts being poured - see tabsApi.advanceTabItemStatus. */
export async function recordSpiritSale(inventoryItemId: string, shotsQuantity: number, tabItemId: string): Promise<void> {
  const db = await getLocalDb();
  const spirit = await db.getFirstAsync<Spirit>('SELECT * FROM spirits WHERE inventoryItemId = ?', [inventoryItemId]);
  if (!spirit) return; // product was marked SPIRIT after the fact with no ledger row yet - nothing to deduct
  const volumeMl = -(spirit.shotSizeMl * shotsQuantity);
  const id = generateId();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO spirit_transactions (id, spiritId, type, volumeMl, tabItemId, createdAt) VALUES (?, ?, 'sale', ?, ?, ?)`,
    [id, spirit.id, volumeMl, tabItemId, now]
  );
  await enqueueOutbox('recordSpiritTransaction', { id, spiritId: spirit.id, type: 'sale', volumeMl, tabItemId, createdAt: now });
  runSync();
}

/**
 * Logs a new physical bottle being opened. Deliberately manual (not automatic) -
 * the system can't know a bottle was opened until a human says so (section 2.3).
 */
export async function restockSpirit(spiritId: string, bottles: number, note?: string): Promise<void> {
  const db = await getLocalDb();
  const spirit = await db.getFirstAsync<Spirit>('SELECT * FROM spirits WHERE id = ?', [spiritId]);
  if (!spirit) throw new Error('Spirit not found');
  await db.runAsync('UPDATE spirits SET bottlesInStock = bottlesInStock + ? WHERE id = ?', [bottles, spiritId]);

  const id = generateId();
  const now = new Date().toISOString();
  const volumeMl = bottles * spirit.bottleSizeMl;
  await db.runAsync(
    `INSERT INTO spirit_transactions (id, spiritId, type, volumeMl, note, createdAt) VALUES (?, ?, 'restock', ?, ?, ?)`,
    [id, spiritId, volumeMl, note ?? null, now]
  );
  await enqueueOutbox('restockSpirit', { spiritId, bottles, transactionId: id, note, createdAt: now });
  runSync();
}

/** Physical stock verification - logs a variance without guessing what the "expected" figure was (section 2.3). */
export async function recordStockCheck(spiritId: string, actualVolumeMl: number, note?: string): Promise<SpiritStockCheck> {
  const db = await getLocalDb();
  const expectedVolumeMl = await getSpiritRemainingMl(spiritId);
  const id = generateId();
  const now = new Date().toISOString();
  const differenceMl = actualVolumeMl - expectedVolumeMl;
  await db.runAsync(
    `INSERT INTO spirit_stock_checks (id, spiritId, expectedVolumeMl, actualVolumeMl, differenceMl, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, spiritId, expectedVolumeMl, actualVolumeMl, differenceMl, note ?? null, now]
  );
  // Also logged as an adjustment transaction so the ledger reconciles with the corrected figure.
  await db.runAsync(
    `INSERT INTO spirit_transactions (id, spiritId, type, volumeMl, note, createdAt) VALUES (?, ?, 'adjustment', ?, ?, ?)`,
    [generateId(), spiritId, differenceMl, note ?? 'Stock check adjustment', now]
  );
  await enqueueOutbox('recordSpiritStockCheck', { id, spiritId, expectedVolumeMl, actualVolumeMl, differenceMl, note, createdAt: now });
  runSync();
  return { id, spiritId, expectedVolumeMl, actualVolumeMl, differenceMl, note, createdAt: now };
}
