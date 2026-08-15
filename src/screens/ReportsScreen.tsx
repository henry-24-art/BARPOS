import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DailySummary, Sale, Expense } from '../types';
import { getTodaySummary, getRecentSales, getTopSellingItems } from '../api/salesApi';
import { getLowStockItems } from '../api/inventoryApi';
import { getExpenses, addExpense, deleteExpense } from '../api/expensesApi';
import { InventoryItem } from '../types';
import { colors, spacing, radius } from '../utils/theme';
import { formatCurrency, formatTime } from '../utils/format';

export default function ReportsScreen() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [topItems, setTopItems] = useState<{ itemName: string; totalQty: number; totalRevenue: number }[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  const load = useCallback(async () => {
    const [s, sales, top, low, exp] = await Promise.all([
      getTodaySummary(),
      getRecentSales(20),
      getTopSellingItems(5),
      getLowStockItems(),
      getExpenses(),
    ]);
    setSummary(s);
    setRecentSales(sales);
    setTopItems(top);
    setLowStock(low);
    setExpenses(exp);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  async function handleAddExpense() {
    const value = parseFloat(expenseAmount);
    if (!expenseDesc.trim() || isNaN(value)) return;
    setSavingExpense(true);
    try {
      await addExpense(expenseDesc.trim(), value);
      setExpenseModalVisible(false);
      setExpenseDesc('');
      setExpenseAmount('');
      await load();
    } finally {
      setSavingExpense(false);
    }
  }

  function handleDeleteExpense(id: string) {
    Alert.alert('Remove Expense', 'Remove this expense entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteExpense(id); await load(); } },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.lg }}>
      <Text style={styles.title}>Today's Report</Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Sales</Text>
        <Text style={styles.summaryValue}>{formatCurrency(summary?.totalSales ?? 0)}</Text>
        <Text style={styles.summarySubtext}>{summary?.totalTransactions ?? 0} transactions</Text>
      </View>

      <View style={styles.paymentGrid}>
        <PaymentTile icon="cash-outline" label="Cash" amount={summary?.cashTotal ?? 0} />
        <PaymentTile icon="card-outline" label="Card" amount={summary?.cardTotal ?? 0} />
        <PaymentTile icon="phone-portrait-outline" label="Mobile Money" amount={summary?.mobileMoneyTotal ?? 0} />
      </View>

      {lowStock.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.sectionTitle}>Low Stock Alerts</Text>
          </View>
          {lowStock.map((item) => (
            <View key={item.id} style={styles.lowStockRow}>
              <Text style={styles.lowStockName}>{item.name}</Text>
              <Text style={styles.lowStockQty}>
                {item.stockQty} {item.unit} left
              </Text>
            </View>
          ))}
        </View>
      )}

      {topItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Selling Items (All Time)</Text>
          {topItems.map((item, idx) => (
            <View key={item.itemName} style={styles.topItemRow}>
              <Text style={styles.topItemRank}>{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.topItemName}>{item.itemName}</Text>
                <Text style={styles.topItemMeta}>{item.totalQty} sold</Text>
              </View>
              <Text style={styles.topItemRevenue}>{formatCurrency(item.totalRevenue)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Expenses</Text>
          <TouchableOpacity onPress={() => setExpenseModalVisible(true)}>
            <Ionicons name="add-circle-outline" size={22} color={colors.brandGreen} />
          </TouchableOpacity>
        </View>
        <Text style={styles.expenseTotalText}>Total: {formatCurrency(totalExpenses)}</Text>
        {expenses.length === 0 ? (
          <Text style={styles.emptyText}>No expenses logged yet</Text>
        ) : (
          expenses.slice(0, 10).map((exp) => (
            <TouchableOpacity key={exp.id} style={styles.saleRow} onLongPress={() => handleDeleteExpense(exp.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.saleToken}>{exp.description}</Text>
                <Text style={styles.saleMeta}>{formatTime(exp.createdAt)}</Text>
              </View>
              <Text style={styles.saleTotal}>{formatCurrency(exp.amount)}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {recentSales.length === 0 ? (
          <Text style={styles.emptyText}>No sales yet today</Text>
        ) : (
          recentSales.map((sale) => (
            <View key={sale.id} style={styles.saleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.saleToken}>{sale.token}</Text>
                <Text style={styles.saleMeta}>
                  {formatTime(sale.closedAt)} · {paymentLabel(sale.paymentMethod)}
                </Text>
              </View>
              <Text style={styles.saleTotal}>{formatCurrency(sale.total)}</Text>
            </View>
          ))
        )}
      </View>

      <Modal visible={expenseModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Expense</Text>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.input}
              value={expenseDesc}
              onChangeText={setExpenseDesc}
              placeholder="e.g. Ice delivery"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              value={expenseAmount}
              onChangeText={setExpenseAmount}
              keyboardType="numeric"
              placeholder="e.g. 15000"
              placeholderTextColor={colors.textFaint}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setExpenseModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, savingExpense && { opacity: 0.6 }]}
                onPress={handleAddExpense}
                disabled={savingExpense}
              >
                <Text style={styles.confirmButtonText}>{savingExpense ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function paymentLabel(method: string) {
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  if (method === 'mobile_money') return 'Mobile Money';
  return method;
}

function PaymentTile({ icon, label, amount }: { icon: any; label: string; amount: number }) {
  return (
    <View style={styles.paymentTile}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.paymentTileAmount}>{formatCurrency(amount)}</Text>
      <Text style={styles.paymentTileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  summaryLabel: { color: colors.textMuted, fontSize: 13 },
  summaryValue: { color: colors.primary, fontSize: 32, fontWeight: '800', marginTop: 4 },
  summarySubtext: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
  paymentGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  paymentTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  paymentTileAmount: { color: colors.text, fontSize: 13, fontWeight: '700' },
  paymentTileLabel: { color: colors.textFaint, fontSize: 11 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: spacing.sm },
  lowStockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lowStockName: { color: colors.text, fontSize: 14 },
  lowStockQty: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  topItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.sm },
  topItemRank: { color: colors.primary, fontWeight: '700', width: 18 },
  topItemName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  topItemMeta: { color: colors.textFaint, fontSize: 11 },
  topItemRevenue: { color: colors.text, fontSize: 13, fontWeight: '600' },
  emptyText: { color: colors.textFaint, fontSize: 13 },
  saleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  saleToken: { color: colors.text, fontSize: 14, fontWeight: '600' },
  saleMeta: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  saleTotal: { color: colors.text, fontSize: 14, fontWeight: '700' },
  expenseTotalText: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  label: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  cancelButton: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { color: colors.textMuted, fontWeight: '600' },
  confirmButton: { backgroundColor: colors.brandGreen },
  confirmButtonText: { color: colors.bg, fontWeight: '700' },
});
