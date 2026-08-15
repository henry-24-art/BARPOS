import { getLocalDb, generateId, enqueueOutbox } from '../offline/localDb';
import { runSync } from '../offline/syncEngine';
import { Expense } from '../types';

export async function getExpenses(): Promise<Expense[]> {
  const db = await getLocalDb();
  return db.getAllAsync<Expense>('SELECT * FROM expenses ORDER BY createdAt DESC');
}

export async function addExpense(description: string, amount: number): Promise<Expense> {
  const db = await getLocalDb();
  const id = generateId();
  const now = new Date().toISOString();
  await db.runAsync('INSERT INTO expenses (id, description, amount, createdAt) VALUES (?, ?, ?, ?)', [
    id,
    description,
    amount,
    now,
  ]);
  await enqueueOutbox('addExpense', { id, description, amount, createdAt: now });
  runSync();
  return { id, description, amount, createdAt: now };
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  await enqueueOutbox('deleteExpense', { id });
  runSync();
}
