import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Logo from '../components/Logo';
import SyncStatusBanner from '../components/SyncStatusBanner';
import { DailySummary } from '../types';
import { getTodaySummary, getTopSellingItems } from '../api/salesApi';
import { getAllInventory, getLowStockItems } from '../api/inventoryApi';
import { getOpenTabs } from '../api/tabsApi';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../utils/theme';
import { formatCurrency } from '../utils/format';

export default function HomeScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [openTabsCount, setOpenTabsCount] = useState(0);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [topItems, setTopItems] = useState<{ itemName: string; totalQty: number; totalRevenue: number }[]>([]);

  const load = useCallback(async () => {
    const [s, tabs, inv, low, top] = await Promise.all([
      getTodaySummary(),
      getOpenTabs(),
      getAllInventory(),
      getLowStockItems(),
      getTopSellingItems(5),
    ]);
    setSummary(s);
    setOpenTabsCount(tabs.length);
    setInventoryCount(inv.length);
    setLowStockCount(low.length);
    setTopItems(top);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <LinearGradient
        colors={[colors.brandBlueDark, colors.brandBlue, colors.brandGreen]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <Logo size={44} showWordmark />
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutIcon}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>
          {user ? `Hi ${user.name.split(' ')[0]} · ` : ''}Your bar, at a glance
        </Text>
      </LinearGradient>

      <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.sm }}>
        <SyncStatusBanner />
      </View>

      <View style={styles.body}>
        {/* Big sales KPI */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Today's Sales</Text>
          <Text style={styles.heroValue}>{formatCurrency(summary?.totalSales ?? 0)}</Text>
          <Text style={styles.heroSubtext}>{summary?.totalTransactions ?? 0} transactions</Text>
        </View>

        {/* KPI grid */}
        <View style={styles.kpiGrid}>
          <KpiCard
            icon="beer-outline"
            iconColor={colors.brandGreen}
            label="Open Tabs"
            value={String(openTabsCount)}
            onPress={() => navigation.navigate('TabsTab')}
          />
          <KpiCard
            icon="cube-outline"
            iconColor={colors.brandBlue}
            label="Products"
            value={String(inventoryCount)}
            onPress={() => navigation.navigate('InventoryTab')}
          />
          <KpiCard
            icon="alert-circle-outline"
            iconColor={lowStockCount > 0 ? colors.danger : colors.textFaint}
            label="Low Stock"
            value={String(lowStockCount)}
            onPress={() => navigation.navigate('InventoryTab')}
          />
          <KpiCard
            icon="card-outline"
            iconColor={colors.brandGreen}
            label="Avg. Sale"
            value={
              summary && summary.totalTransactions > 0
                ? formatCurrency(Math.round(summary.totalSales / summary.totalTransactions))
                : formatCurrency(0)
            }
          />
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <ActionButton
            icon="add-circle-outline"
            label="New Tab"
            onPress={() => navigation.navigate('TabsTab')}
          />
          <ActionButton
            icon="cube-outline"
            label="Add Product"
            onPress={() => navigation.navigate('InventoryTab')}
          />
          <ActionButton
            icon="bar-chart-outline"
            label="Reports"
            onPress={() => navigation.navigate('Reports')}
          />
        </View>

        {/* Payment breakdown */}
        <Text style={styles.sectionTitle}>Payment Methods Today</Text>
        <View style={styles.paymentRow}>
          <PaymentPill label="Cash" amount={summary?.cashTotal ?? 0} />
          <PaymentPill label="Card" amount={summary?.cardTotal ?? 0} />
          <PaymentPill label="Mobile Money" amount={summary?.mobileMoneyTotal ?? 0} />
        </View>

        {/* Top items */}
        {topItems.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top Sellers</Text>
            <View style={styles.card}>
              {topItems.map((item, idx) => (
                <View key={item.itemName} style={styles.topItemRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.topItemName}>{item.itemName}</Text>
                  <Text style={styles.topItemQty}>{item.totalQty} sold</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function KpiCard({ icon, iconColor, label, value, onPress }: any) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.kpiCard} onPress={onPress}>
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Wrapper>
  );
}

function ActionButton({ icon, label, onPress }: any) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={22} color={colors.brandGreen} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function PaymentPill({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.paymentPill}>
      <Text style={styles.paymentPillAmount}>{formatCurrency(amount)}</Text>
      <Text style={styles.paymentPillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  signOutIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: spacing.md },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: -spacing.lg,
    marginBottom: spacing.md,
  },
  heroLabel: { color: colors.textMuted, fontSize: 13 },
  heroValue: { color: colors.brandGreen, fontSize: 34, fontWeight: '800', marginTop: 4 },
  heroSubtext: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  kpiCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  kpiValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  kpiLabel: { color: colors.textFaint, fontSize: 12 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: spacing.sm, marginBottom: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actionButton: { flex: 1, alignItems: 'center', gap: 6 },
  actionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  paymentRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  paymentPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  paymentPillAmount: { color: colors.text, fontSize: 13, fontWeight: '700' },
  paymentPillLabel: { color: colors.textFaint, fontSize: 11 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  topItemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: { color: colors.brandGreen, fontSize: 12, fontWeight: '700' },
  topItemName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  topItemQty: { color: colors.textFaint, fontSize: 12 },
});
