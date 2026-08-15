import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RestaurantTable, TableStatus } from '../types';
import { getTables, createTable, deleteTable, openTableOrder } from '../api/tablesApi';
import { colors, spacing, radius } from '../utils/theme';

const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'Available',
  order_in_progress: 'Ordering',
  active_order: 'Active Order',
  awaiting_payment: 'Awaiting Payment',
};

const STATUS_COLOR: Record<TableStatus, string> = {
  available: colors.brandGreen,
  order_in_progress: colors.warning,
  active_order: colors.brandBlue,
  awaiting_payment: colors.danger,
};

export default function TablesScreen({ navigation }: any) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await getTables();
    setTables(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleAddTable() {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      await createTable(newLabel.trim());
      setAddModalVisible(false);
      setNewLabel('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleTablePress(table: RestaurantTable) {
    if (table.status === 'available') {
      try {
        const tab = await openTableOrder(table.id, table.label);
        await load();
        navigation.navigate('TabDetail', { tabId: tab.id });
      } catch (e: any) {
        Alert.alert('Could not open table', e.message);
      }
    } else if (table.currentTabId) {
      navigation.navigate('TabDetail', { tabId: table.currentTabId });
    }
  }

  function handleLongPress(table: RestaurantTable) {
    if (table.status !== 'available') return;
    Alert.alert('Remove Table', `Remove ${table.label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTable(table.id);
            await load();
          } catch (e: any) {
            Alert.alert('Could not remove table', e.message);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tables</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setAddModalVisible(true)}>
          <Ionicons name="add" size={20} color={colors.bg} />
        </TouchableOpacity>
      </View>

      {tables.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="grid-outline" size={48} color={colors.textFaint} />
          <Text style={styles.emptyText}>No tables set up yet</Text>
          <Text style={styles.emptySubtext}>Tap + to add your first table</Text>
        </View>
      ) : (
        <FlatList
          data={tables}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={{ padding: spacing.md }}
          columnWrapperStyle={{ gap: spacing.sm }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.tableCard}
              onPress={() => handleTablePress(item)}
              onLongPress={() => handleLongPress(item)}
            >
              <Text style={styles.tableLabel}>{item.label}</Text>
              <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[item.status] + '26' }]}>
                <Text style={[styles.statusPillText, { color: STATUS_COLOR[item.status] }]}>
                  {STATUS_LABEL[item.status]}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={addModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Table</Text>
            <TextInput
              style={styles.input}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g. Table 5"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setAddModalVisible(false);
                  setNewLabel('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, saving && { opacity: 0.6 }]}
                onPress={handleAddTable}
                disabled={saving}
              >
                <Text style={styles.confirmButtonText}>{saving ? 'Adding...' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  addButton: { backgroundColor: colors.brandGreen, padding: spacing.sm + 2, borderRadius: radius.full },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: colors.textFaint, fontSize: 13 },
  tableCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    minHeight: 90,
    justifyContent: 'space-between',
  },
  tableLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  statusPill: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
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
