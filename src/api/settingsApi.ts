import { getLocalDb, enqueueOutbox } from '../offline/localDb';
import { runSync } from '../offline/syncEngine';
import { BusinessSettings } from '../types';

/**
 * Module-gating flags per architecture.md section 1: "Feature gating is data-driven,
 * not hardcoded per business." Both RootNavigator (frontend nav) and, once the
 * corresponding server routes are deployed, API middleware read from this same
 * settings object, so there's never a mismatch between what's shown and what's allowed.
 */
export async function getBusinessSettings(): Promise<BusinessSettings> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM business_settings WHERE id = ?', ['singleton']);
  return {
    restaurantEnabled: !!row?.restaurantEnabled,
    spiritTrackingEnabled: row ? !!row.spiritTrackingEnabled : true,
    tableManagementEnabled: !!row?.tableManagementEnabled,
  };
}

export async function updateBusinessSettings(patch: Partial<BusinessSettings>): Promise<BusinessSettings> {
  const db = await getLocalDb();
  const current = await getBusinessSettings();
  const next = { ...current, ...patch };
  await db.runAsync(
    `UPDATE business_settings SET restaurantEnabled = ?, spiritTrackingEnabled = ?, tableManagementEnabled = ? WHERE id = ?`,
    [next.restaurantEnabled ? 1 : 0, next.spiritTrackingEnabled ? 1 : 0, next.tableManagementEnabled ? 1 : 0, 'singleton']
  );
  await enqueueOutbox('updateBusinessSettings', next);
  runSync();
  return next;
}
