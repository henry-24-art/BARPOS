import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Tab } from '../types';
import { getOpenTabs, openTab } from '../api/tabsApi';
import { colors, spacing, radius } from '../utils/theme';
import { formatTime } from '../utils/format';

const TOTAL_BANDS = 60; // adjust to how many numbered wristbands you own

export default function TabsScreen({ navigation }: any) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [token, setToken] = useState('');
  const [customTokenMode, setCustomTokenMode] = useState(false);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await getOpenTabs();
    setTabs(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const takenBandNumbers = useMemo(() => new Set(tabs.map((t) => t.token)), [tabs]);

  function resetForm() {
    setToken('');
    setDescription('');
    setCustomTokenMode(false);
  }

  async function handleCreateTab() {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const tab = await openTab(token.trim(), description.trim() || undefined);
      setModalVisible(false);
      resetForm();
      await load();
      navigation.navigate('TabDetail', { tabId: tab.id });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Open Tabs</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color={colors.bg} />
          <Text style={styles.addButtonText}>New Tab</Text>
        </TouchableOpacity>
      </View>

      {tabs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="beer-outline" size={48} color={colors.textFaint} />
          <Text style={styles.emptyText}>No open tabs right now</Text>
          <Text style={styles.emptySubtext}>Tap "New Tab" when a customer arrives</Text>
        </View>
      ) : (
        <FlatList
          data={tabs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.tabCard}
              onPress={() => navigation.navigate('TabDetail', { tabId: item.id })}
            >
              <View style={styles.tokenBadge}>
                <Text style={styles.tokenBadgeText}>{item.token}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tabCustomer}>
                  {item.customerName || 'Walk-in Customer'}
                </Text>
                <Text style={styles.tabMeta}>Opened {formatTime(item.openedAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.fullModal}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Open New Tab</Text>
            <TouchableOpacity
              onPress={() => {
                setModalVisible(false);
                resetForm();
              }}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Wristband Number</Text>
              <TouchableOpacity onPress={() => setCustomTokenMode((v) => !v)}>
                <Text style={styles.toggleLink}>
                  {customTokenMode ? 'Use number grid' : 'Type custom token instead'}
                </Text>
              </TouchableOpacity>
            </View>

            {customTokenMode ? (
              <TextInput
                style={styles.input}
                placeholder="e.g. Table 4, VIP 2, Band #12"
                placeholderTextColor={colors.textFaint}
                value={token}
                onChangeText={setToken}
                autoFocus
              />
            ) : (
              <View style={styles.bandGrid}>
                {Array.from({ length: TOTAL_BANDS }, (_, i) => String(i + 1)).map((num) => {
                  const isTaken = takenBandNumbers.has(num);
                  const isSelected = token === num;
                  return (
                    <TouchableOpacity
                      key={num}
                      disabled={isTaken}
                      onPress={() => setToken(num)}
                      style={[
                        styles.bandChip,
                        isSelected && styles.bandChipSelected,
                        isTaken && styles.bandChipTaken,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bandChipText,
                          isSelected && styles.bandChipTextSelected,
                          isTaken && styles.bandChipTextTaken,
                        ]}
                      >
                        {num}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>
              Description <Text style={styles.optionalTag}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              placeholder="e.g. Regular customer, VIP, Birthday celebration, Table 7 group"
              placeholderTextColor={colors.textFaint}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.confirmButton, !token.trim() && { opacity: 0.5 }]}
              onPress={handleCreateTab}
              disabled={!token.trim() || saving}
            >
              <Text style={styles.confirmButtonText}>{saving ? 'Opening...' : 'Open Tab'}</Text>
            </TouchableOpacity>
          </ScrollView>
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    gap: 4,
  },
  addButtonText: { color: colors.bg, fontWeight: '700', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: colors.textFaint, fontSize: 13 },
  tabCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  tokenBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tokenBadgeText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  tabCustomer: { color: colors.text, fontSize: 16, fontWeight: '600' },
  tabMeta: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  fullModal: { flex: 1, backgroundColor: colors.bg },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  optionalTag: { color: colors.textFaint, fontWeight: '400' },
  toggleLink: { color: colors.brandGreen, fontSize: 12, fontWeight: '600' },
  bandGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bandChip: {
    width: 52,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandChipSelected: { backgroundColor: colors.brandGreen, borderColor: colors.brandGreen },
  bandChipTaken: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, opacity: 0.4 },
  bandChipText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  bandChipTextSelected: { color: colors.bg },
  bandChipTextTaken: { color: colors.textFaint },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  descriptionInput: { minHeight: 80 },
  confirmButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  confirmButtonText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
});
