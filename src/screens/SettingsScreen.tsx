import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BusinessSettings } from '../types';
import { getBusinessSettings, updateBusinessSettings } from '../api/settingsApi';
import { createStaffAccount, changePassword, listStaff, updateStaffAccount, StaffRole, StaffMember } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, activeThemeName, setThemePreference, THEME_OPTIONS, ThemeName } from '../utils/theme';

const ROLE_OPTIONS: { key: StaffRole; label: string }[] = [
  { key: 'waiter', label: 'Waiter / Bartender' },
  { key: 'kitchen', label: 'Kitchen Staff' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'manager', label: 'Manager' },
  { key: 'admin', label: 'Administrator' },
];

const EMPTY_STAFF_FORM = { name: '', username: '', password: '', role: 'waiter' as StaffRole };
const EMPTY_PASSWORD_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' };

/** Quick visual-only strength score (0-4), same rules as the web signup form. */
function scorePasswordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}
const STRENGTH_LABELS = ['Too short', 'Weak', 'Good', 'Strong'];
const STRENGTH_COLORS = [colors.danger, colors.warning, '#7CC96B', colors.brandGreen];

/**
 * Owner/admin-only module toggles. These flags are what RootNavigator reads to decide
 * which tabs render (Tables, Kitchen, Bar Queue, Spirits) - see architecture.md section 1.
 */
export default function SettingsScreen() {
  const { hasRole } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [savingStaff, setSavingStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  const [selectedTheme, setSelectedTheme] = useState<ThemeName>(activeThemeName);

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const load = useCallback(async () => {
    const s = await getBusinessSettings();
    setSettings(s);
    if (hasRole('admin')) {
      try {
        const staffList = await listStaff();
        setStaff(staffList);
      } catch {
        // Non-fatal — settings still loaded, staff list just stays empty until next load.
      }
    }
  }, [hasRole]);

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
      load();
    } catch (e: any) {
      Alert.alert('Could not create account', e.message || 'This requires an internet connection.');
    } finally {
      setSavingStaff(false);
    }
  }

  async function handleChangeRole(member: StaffMember, role: StaffRole) {
    if (role === member.role) return;
    setEditingStaffId(member.id);
    // Optimistic update so the chip reflects the change immediately.
    setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
    try {
      await updateStaffAccount(member.id, { role });
    } catch (e: any) {
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: member.role } : m))); // revert
      Alert.alert('Could not update role', e.message || 'This requires an internet connection.');
    } finally {
      setEditingStaffId(null);
    }
  }

  async function handleToggleActive(member: StaffMember) {
    const nextActive = !member.active;
    setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, active: nextActive } : m)));
    try {
      await updateStaffAccount(member.id, { active: nextActive });
    } catch (e: any) {
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, active: member.active } : m))); // revert
      Alert.alert('Could not update account', e.message || 'This requires an internet connection.');
    }
  }

  async function handleChangePassword() {
    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    if (!currentPassword || newPassword.length < 6) {
      Alert.alert('Missing info', 'Enter your current password and a new password of at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords don't match", 'Re-type your new password to confirm it.');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordModalVisible(false);
      setPasswordForm(EMPTY_PASSWORD_FORM);
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      Alert.alert('Password changed', 'Use your new password next time you log in.');
    } catch (e: any) {
      Alert.alert('Could not change password', e.message || 'This requires an internet connection.');
    } finally {
      setSavingPassword(false);
    }
  }

  function handleSelectTheme(name: ThemeName) {
    if (name === selectedTheme) return;
    setSelectedTheme(name);
    setThemePreference(name);
    Alert.alert(
      'Theme saved',
      'Fully close and reopen the app (not just switch away and back) to see the new colors everywhere.'
    );
  }

  const newPasswordStrength = scorePasswordStrength(passwordForm.newPassword);

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

      <View style={[styles.card, { marginTop: spacing.md }]}>
        <TouchableOpacity
          style={styles.staffHeaderRow}
          onPress={() => setPasswordModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Change Password</Text>
            <Text style={styles.rowDescription}>Update the password for your own account.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { marginTop: spacing.md }]}>
        <Text style={styles.rowLabel}>Appearance</Text>
        <Text style={styles.rowDescription}>Choose a color theme for the app.</Text>
        <View style={{ marginTop: spacing.sm }}>
          {THEME_OPTIONS.map((opt) => {
            const selected = selectedTheme === opt.name;
            return (
              <TouchableOpacity
                key={opt.name}
                style={styles.themeOptionRow}
                onPress={() => handleSelectTheme(opt.name)}
                activeOpacity={0.7}
              >
                <View style={[styles.themeSwatch, { backgroundColor: opt.swatch }]} />
                <Text style={styles.themeOptionLabel}>{opt.label}</Text>
                {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {hasRole('admin') && (
        <View style={[styles.card, { marginTop: spacing.md }]}>
          <View style={styles.staffHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Staff Accounts</Text>
              <Text style={styles.rowDescription}>Tap a role chip to change it. Toggle to deactivate a login.</Text>
            </View>
            <TouchableOpacity style={styles.addStaffButton} onPress={() => setStaffModalVisible(true)}>
              <Text style={styles.addStaffButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {staff.length === 0 ? (
            <Text style={styles.staffEmptyText}>No staff accounts yet — tap Add to create the first one.</Text>
          ) : (
            staff.map((member) => (
              <View key={member.id} style={styles.staffRow}>
                <View style={styles.staffRowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.staffName, !member.active && styles.staffNameInactive]}>{member.name}</Text>
                    <Text style={styles.staffUsername}>@{member.username}</Text>
                  </View>
                  <Switch
                    value={member.active}
                    onValueChange={() => handleToggleActive(member)}
                    trackColor={{ false: colors.border, true: colors.brandGreen }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={[styles.chipRow, { marginTop: spacing.xs }]}>
                  {ROLE_OPTIONS.map((opt) => {
                    const selected = member.role === opt.key;
                    const busy = editingStaffId === member.id;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.roleChipSmall, selected && styles.chipSelected, busy && { opacity: 0.5 }]}
                        onPress={() => handleChangeRole(member, opt.key)}
                        disabled={busy}
                      >
                        <Text style={[styles.roleChipSmallText, selected && styles.chipTextSelected]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
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

      <Modal visible={passwordModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <Text style={styles.fieldLabel}>Current Password</Text>
            <View style={styles.passwordFieldRow}>
              <TextInput
                style={styles.passwordInput}
                value={passwordForm.currentPassword}
                onChangeText={(v) => setPasswordForm({ ...passwordForm, currentPassword: v })}
                placeholder="Your current password"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!showCurrentPassword}
                autoFocus
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowCurrentPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textFaint} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>New Password</Text>
            <View style={styles.passwordFieldRow}>
              <TextInput
                style={styles.passwordInput}
                value={passwordForm.newPassword}
                onChangeText={(v) => setPasswordForm({ ...passwordForm, newPassword: v })}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!showNewPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowNewPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textFaint} />
              </TouchableOpacity>
            </View>

            {passwordForm.newPassword.length > 0 && (
              <View style={styles.strengthWrap}>
                <View style={styles.strengthMeter}>
                  {[0, 1, 2, 3].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthBar,
                        i < newPasswordStrength && { backgroundColor: STRENGTH_COLORS[Math.max(newPasswordStrength - 1, 0)] },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.strengthLabel}>{STRENGTH_LABELS[Math.max(newPasswordStrength - 1, 0)]}</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Confirm New Password</Text>
            <TextInput
              style={styles.input}
              value={passwordForm.confirmPassword}
              onChangeText={(v) => setPasswordForm({ ...passwordForm, confirmPassword: v })}
              placeholder="Re-type new password"
              placeholderTextColor={colors.textFaint}
              secureTextEntry={!showNewPassword}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setPasswordModalVisible(false);
                  setPasswordForm(EMPTY_PASSWORD_FORM);
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, savingPassword && { opacity: 0.6 }]}
                onPress={handleChangePassword}
                disabled={savingPassword}
              >
                <Text style={styles.confirmButtonText}>{savingPassword ? 'Saving...' : 'Save'}</Text>
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
  themeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  themeSwatch: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  themeOptionLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.border },
  staffHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  staffEmptyText: { color: colors.textFaint, fontSize: 13, marginTop: spacing.sm },
  staffRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  staffRowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  staffName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  staffNameInactive: { color: colors.textFaint, textDecorationLine: 'line-through' },
  staffUsername: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  roleChipSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleChipSmallText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
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
  passwordFieldRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    paddingRight: 40,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  eyeButton: { position: 'absolute', right: 10 },
  strengthWrap: { marginTop: 8 },
  strengthMeter: { flexDirection: 'row', gap: 4 },
  strengthBar: { flex: 1, height: 4, borderRadius: radius.full, backgroundColor: colors.border },
  strengthLabel: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
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
