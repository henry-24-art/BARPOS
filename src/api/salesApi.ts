import { getLocalDb } from '../offline/localDb';
import { Sale, DailySummary } from '../types';

export async function getTodaySummary(): Promise<DailySummary> {
  const db = await getLocalDb();
  const todayStr = new Date().toISOString().slice(0, 10);
  const sales = await db.getAllAsync<Sale>("SELECT * FROM sales WHERE closedAt LIKE ? || '%'", [todayStr]);

  const summary: DailySummary = {
    date: todayStr,
    totalSales: 0,
    totalTransactions: sales.length,
    cashTotal: 0,
    cardTotal: 0,
    mobileMoneyTotal: 0,
  };
  for (const sale of sales) {
    summary.totalSales += sale.total;
    if (sale.paymentMethod === 'cash') summary.cashTotal += sale.total;
    else if (sale.paymentMethod === 'card') summary.cardTotal += sale.total;
    else if (sale.paymentMethod === 'mobile_money') summary.mobileMoneyTotal += sale.total;
  }
  return summary;
}

export async function getRecentSales(limit: number = 50): Promise<Sale[]> {
  const db = await getLocalDb();
  return db.getAllAsync<Sale>('SELECT * FROM sales ORDER BY closedAt DESC LIMIT ?', [limit]);
}

export async function getTopSellingItems(
  limit: number = 10
): Promise<{ itemName: string; totalQty: number; totalRevenue: number }[]> {
  const db = await getLocalDb();
  return db.getAllAsync(
    `SELECT itemName, SUM(quantity) as totalQty, SUM(lineTotal) as totalRevenue
     FROM sale_items GROUP BY itemName ORDER BY totalRevenue DESC LIMIT ?`,
    [limit]
  );
}
