import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SpiritWithStatus, getSpirits, restockSpirit, recordStockCheck } from '../api/spiritsApi';
import { colors, spacing, radius } from '../utils/theme';

type ModalMode = 'restock' | 'stockcheck' | null;

export default function SpiritsScreen() {
  const [spirits, setSpirits] = useState<SpiritWithStatus[]>([]);
  const [selected, setSelected] = useState<SpiritWithStatus | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await getSpirits();
    setSpirits(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function openModal(spirit: SpiritWithStatus, mode: ModalMode) {
    setSelected(spirit);
    setModalMode(mode);
    setAmount('');
    setNote('');
  }

  function closeModal() {
    setSelected(null);
    setModalMode(null);
  }

  async function handleSubmit() {
    if (!selected) return;
    const value = parseFloat(amount);
    if (isNaN(value)) return;
    setSaving(true);
    try {
      if (modalMode === 'restock') {
        await restockSpirit(selected.id, value, note.trim() || undefined);
      } else if (modalMode === 'stockcheck') {
        await recordStockCheck(selected.id, value, note.trim() || undefined);
      }
      closeModal();
      await load();
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Spirits</Text>
        <Text style={styles.subtitle}>Bottle-level tracking, ml remaining is derived from the movement ledger</Text>
      </View>

      {spirits.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="wine-outline" size={48} color={colors.textFaint} />
          <Text style={styles.emptyText}>No spirits tracked yet</Text>
          <Text style={styles.emptySubtext}>Mark an inventory item's type as "Spirit" to see it here</Text>
        </View>
      ) : (
        <FlatList
          data={spirits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => {
            const bottlesRemaining = item.remainingMl / item.bottleSizeMl;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.spiritName}>{item.name}</Text>
                  {item.lowStock && (
                    <View style={styles.lowBadge}>
                      <Text style={styles.lowBadgeText}>Low</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>
                  {bottlesRemaining.toFixed(2)} bottles remaining ({Math.round(item.remainingMl)} ml) · {item.shotSizeMl}ml shots
                </Text>
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => openModal(item, 'restock')}>
                    <Ionicons name="add-circle-outline" size={16} color={colors.brandGreen} />
                    <Text style={styles.actionButtonText}>Log Restock</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => openModal(item, 'stockcheck')}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.brandBlue} />
                    <Text style={[styles.actionButtonText, { color: colors.brandBlue }]}>Stock Check</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!modalMode} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {modalMode === 'restock' ? `Log Bottle Opened - ${selected?.name}` : `Stock Check - ${selected?.name}`}
            </Text>
            <Text style={styles.label}>
              {modalMode === 'restock' ? 'Bottles opened' : 'Actual volume remaining (ml)'}
            </Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder={modalMode === 'restock' ? 'e.g. 1' : 'e.g. 480'}
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Physical count during closing"
              placeholderTextColor={colors.textFaint}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closeModal}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, (saving || !amount) && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={saving || !amount}
              >
                <Text style={styles.confirmButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
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
  header: { padding: spacing.md, paddingTop: spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
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
    gap: 6,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  spiritName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  lowBadge: { backgroundColor: 'rgba(229,72,77,0.15)', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  lowBadgeText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  meta: { color: colors.textFaint, fontSize: 12 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionButtonText: { color: colors.brandGreen, fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
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
