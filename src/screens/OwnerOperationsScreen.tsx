import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useState, useCallback } from 'react';
import { BusinessSettings } from '../types';
import { getBusinessSettings } from '../api/settingsApi';
import { getOpenTabs, getQueueItems } from '../api/tabsApi';
import { getLowStockItems } from '../api/inventoryApi';
import { colors, spacing, radius } from '../utils/theme';

interface OperationCard {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  show?: boolean;
  count?: number;
  countLabel?: string;
}

/**
 * Owner/manager landing pad for jumping into the same operational screens that
 * bar and kitchen staff use day-to-day, so an owner can see exactly what their
 * floor sees without living in either portal full-time. Each card also carries
 * a live count pulled from the same data the corresponding portal shows, so an
 * owner gets real cross-portal visibility at a glance, not just a shortcut list.
 */
export default function OwnerOperationsScreen({ navigation }: any) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [openTabs, setOpenTabs] = useState(0);
  const [barPending, setBarPending] = useState(0);
  const [kitchenPending, setKitchenPending] = useState(0);
  const [lowStock, setLowStock] = useState(0);

  const load = useCallback(async () => {
    const s = await getBusinessSettings();
    setSettings(s);
    const tasks: Promise<void>[] = [
      getOpenTabs().then((t) => setOpenTabs(t.length)),
      getLowStockItems().then((l) => setLowStock(l.length)),
    ];
    if (s.restaurantEnabled) {
      tasks.push(
        getQueueItems('bar').then((items) => setBarPending(items.filter((i) => i.status !== 'delivered').length)),
        getQueueItems('kitchen').then((items) => setKitchenPending(items.filter((i) => i.status !== 'delivered').length))
      );
    }
    await Promise.all(tasks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Keep the counts live while the owner is looking at this screen, the same
      // way the bar/kitchen portals themselves poll for updates.
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  const cards: OperationCard[] = [
    { key: 'tabs', title: 'Bar Tabs', description: 'Open tabs, add items, take payment', icon: 'beer-outline', route: 'OwnerTabs', count: openTabs, countLabel: 'open' },
    {
      key: 'tables',
      title: 'Tables',
      description: 'Seating and table status',
      icon: 'grid-outline',
      route: 'OwnerTables',
      show: !!settings?.restaurantEnabled && !!settings?.tableManagementEnabled,
    },
    {
      key: 'barQueue',
      title: 'Bar Queue',
      description: 'Drink orders waiting to be made',
      icon: 'flame-outline',
      route: 'OwnerBarQueue',
      show: !!settings?.restaurantEnabled,
      count: barPending,
      countLabel: 'pending',
    },
    {
      key: 'kitchen',
      title: 'Kitchen Queue',
      description: "What the kitchen is working on right now",
      icon: 'restaurant-outline',
      route: 'OwnerKitchen',
      show: !!settings?.restaurantEnabled,
      count: kitchenPending,
      countLabel: 'pending',
    },
    { key: 'inventory', title: 'Inventory', description: 'Stock levels and pricing', icon: 'cube-outline', route: 'OwnerInventory', count: lowStock, countLabel: 'low stock' },
    {
      key: 'spirits',
      title: 'Spirit Tracking',
      description: 'Bottle-level stock and shot ledger',
      icon: 'wine-outline',
      route: 'OwnerSpirits',
      show: !!settings?.spiritTrackingEnabled,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Operations</Text>
      <Text style={styles.subtitle}>A live look into the bar and kitchen floors.</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {cards
          .filter((c) => c.show !== false)
          .map((c) => (
            <TouchableOpacity key={c.key} style={styles.card} onPress={() => navigation.navigate(c.route)}>
              <View style={styles.iconWrap}>
                <Ionicons name={c.icon} size={22} color={colors.brandGreen} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{c.title}</Text>
                <Text style={styles.cardDescription}>{c.description}</Text>
              </View>
              {c.count !== undefined && c.count > 0 && (
                <View style={[styles.countBadge, c.countLabel === 'low stock' && styles.countBadgeWarning]}>
                  <Text style={[styles.countBadgeText, c.countLabel === 'low stock' && styles.countBadgeWarningText]}>
                    {c.count} {c.countLabel}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, paddingTop: spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.textFaint, fontSize: 13, marginTop: 6, marginBottom: spacing.md, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  cardDescription: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  countBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: { color: colors.brandGreen, fontSize: 11, fontWeight: '700' },
  countBadgeWarning: { backgroundColor: colors.warning + '26' },
  countBadgeWarningText: { color: colors.warning },
});

