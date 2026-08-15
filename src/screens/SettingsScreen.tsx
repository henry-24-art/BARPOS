import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BusinessSettings } from '../types';
import { getBusinessSettings, updateBusinessSettings } from '../api/settingsApi';
import { createStaffAccount, StaffRole } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../utils/theme';

const ROLE_OPTIONS: { key: StaffRole; label: string }[] = [
  { key: 'waiter', label: 'Waiter / Bartender' },
  { key: 'kitchen', label: 'Kitchen Staff' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'manager', label: 'Manager' },
  { key: 'admin', label: 'Administrator' },
];

const EMPTY_STAFF_FORM = { name: '', username: '', password: '', role: 'waiter' as StaffRole };

/**
 * Owner/admin-only module toggles. These flags are what RootNavigator reads to decide
 * which tabs render (Tables, Kitchen, Bar Queue, Spirits) - see architecture.md section 1.
 */
export default function SettingsScreen() {
  const { hasRole } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [savingStaff, setSavingStaff] = useState(false);

  const load = useCallback(async () => {
    const s = await getBusinessSettings();
    setSettings(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggle(key: keyof BusinessSettings, value: boolean) {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next); // optimistic
    await updateBusinessSettings({ [key]: value });
  }

  if (!settings) return null;

  async function handleAddStaff() {
    if (!staffForm.name.trim() || !staffForm.username.trim() || staffForm.password.length < 6) {
      Alert.alert('Missing info', 'Name, username, and a password of at least 6 characters are required.');
      return;
    }
    setSavingStaff(true);
    try {
      await createStaffAccount({
        name: staffForm.name.trim(),
        username: staffForm.username.trim(),
        password: staffForm.password,
        role: staffForm.role,
      });
      setStaffModalVisible(false);
      setStaffForm(EMPTY_STAFF_FORM);
      Alert.alert('Staff account created', `${staffForm.name.trim()} can now log in.`);
    } catch (e: any) {
      Alert.alert('Could not create account', e.message || 'This requires an internet connection.');
    } finally {
      setSavingStaff(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.lg }}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>
        Turn on restaurant mode to route food orders to a kitchen queue, manage tables, and track spirits.
      </Text>

      <View style={styles.card}>
        <SettingRow
          label="Restaurant / Kitchen Mode"
          description="Adds order routing (bar vs kitchen), a kitchen queue, and table management."
          value={settings.restaurantEnabled}
          onChange={(v) => toggle('restaurantEnabled', v)}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Table Management"
          description="Adds a Tables tab for seating and tracking table status."
          value={settings.tableManagementEnabled}
          disabled={!settings.restaurantEnabled}
          onChange={(v) => toggle('tableManagementEnabled', v)}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Spirit Tracking"
          description="Tracks bottle-level stock for products marked as Spirit, with a movement ledger."
          value={settings.spiritTrackingEnabled}
          onChange={(v) => toggle('spiritTrackingEnabled', v)}
        />
      </View>

      {hasRole('admin') && (
        <View style={[styles.card, { marginTop: spacing.md }]}>
          <View style={styles.staffHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Staff Accounts</Text>
              <Text style={styles.rowDescription}>Create a login for a waiter, kitchen staff, cashier, or manager.</Text>
            </View>
            <TouchableOpacity style={styles.addStaffButton} onPress={() => setStaffModalVisible(true)}>
              <Text style={styles.addStaffButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={staffModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Staff Account</Text>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={staffForm.name}
              onChangeText={(v) => setStaffForm({ ...staffForm, name: v })}
              placeholder="e.g. Grace Banda"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              style={styles.input}
              value={staffForm.username}
              onChangeText={(v) => setStaffForm({ ...staffForm, username: v })}
              placeholder="e.g. grace"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={staffForm.password}
              onChangeText={(v) => setStaffForm({ ...staffForm, password: v })}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
            />
            <Text style={styles.fieldLabel}>Role</Text>
            <View style={styles.chipRow}>
              {ROLE_OPTIONS.map((opt) => {
                const selected = staffForm.role === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setStaffForm({ ...staffForm, role: opt.key })}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setStaffModalVisible(false);
                  setStaffForm(EMPTY_STAFF_FORM);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, savingStaff && { opacity: 0.6 }]}
                onPress={handleAddStaff}
                disabled={savingStaff}
              >
                <Text style={styles.confirmButtonText}>{savingStaff ? 'Creating...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function SettingRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.brandGreen, false: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.textFaint, fontSize: 13, marginTop: 6, marginBottom: spacing.md, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowDescription: { color: colors.textFaint, fontSize: 12, marginTop: 2, lineHeight: 16 },
  divider: { height: 1, backgroundColor: colors.border },
  staffHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  addStaffButton: { backgroundColor: colors.brandGreen, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 8 },
  addStaffButtonText: { color: colors.bg, fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  fieldLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipSelected: { backgroundColor: colors.brandGreen, borderColor: colors.brandGreen },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.bg },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  cancelButton: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { color: colors.textMuted, fontWeight: '600' },
  confirmButton: { backgroundColor: colors.brandGreen },
  confirmButtonText: { color: colors.bg, fontWeight: '700' },
});
