import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TabItem, OrderItemStatus, ProductModule } from '../types';
import { getQueueItems, advanceTabItemStatus } from '../api/tabsApi';
import { colors, spacing, radius } from '../utils/theme';
import { formatTime } from '../utils/format';

const STATUS_LABEL: Record<OrderItemStatus, string> = {
  new: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Delivered',
};

const STATUS_COLOR: Record<OrderItemStatus, string> = {
  new: colors.warning,
  accepted: colors.brandBlue,
  preparing: colors.brandBlue,
  ready: colors.brandGreen,
  delivered: colors.textFaint,
};

const NEXT_ACTION_LABEL: Record<OrderItemStatus, string> = {
  new: 'Accept',
  accepted: 'Start Preparing',
  preparing: 'Mark Ready',
  ready: 'Mark Delivered',
  delivered: '',
};

/**
 * Route-scoped order queue - kitchen sees route='kitchen' items, bar sees route='bar'.
 * Polls on focus + a short interval as the offline-first equivalent of the doc's
 * Socket.IO push (architecture.md section 6's own polling fallback).
 */
export default function OrderQueueScreen({ route, title, icon }: { route: ProductModule; title: string; icon: any }) {
  const [items, setItems] = useState<(TabItem & { token: string })[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await getQueueItems(route);
    setItems(data);
  }, [route]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 8000);
      return () => clearInterval(interval);
    }, [load])
  );

  async function handleAdvance(item: TabItem) {
    setBusyId(item.id);
    try {
      await advanceTabItemStatus(item.id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{items.length} active</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name={icon} size={48} color={colors.textFaint} />
          <Text style={styles.emptyText}>Nothing in the queue</Text>
          <Text style={styles.emptySubtext}>New order items will show up here automatically</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.itemName}>
                    {item.quantity}x {item.itemName}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[item.status] + '26' }]}>
                    <Text style={[styles.statusBadgeText, { color: STATUS_COLOR[item.status] }]}>
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {item.token} · added {formatTime(item.addedAt)}
                </Text>
              </View>
              {item.status !== 'delivered' && (
                <TouchableOpacity
                  style={[styles.actionButton, busyId === item.id && { opacity: 0.6 }]}
                  onPress={() => handleAdvance(item)}
                  disabled={busyId === item.id}
                >
                  <Text style={styles.actionButtonText}>{NEXT_ACTION_LABEL[item.status]}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, paddingTop: spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.textFaint, fontSize: 13, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: colors.textFaint, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { color: colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  meta: { color: colors.textFaint, fontSize: 12 },
  actionButton: {
    backgroundColor: colors.brandGreen,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonText: { color: colors.bg, fontWeight: '700', fontSize: 13 },
});
