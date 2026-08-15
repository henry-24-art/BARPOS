import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { StaffRole } from '../api/authApi';
import { colors, spacing, radius } from '../utils/theme';

const BUSINESS_TYPES = ['Bar', 'Restaurant', 'Bar & Restaurant', 'Nightclub', 'Lodge / Hotel', 'Other'];

const STAFF_ROLE_OPTIONS: { key: Exclude<StaffRole, 'admin'>; label: string; hint: string }[] = [
  { key: 'manager', label: 'Manager', hint: 'Runs the floor, edits inventory' },
  { key: 'cashier', label: 'Cashier', hint: 'Takes payment, views reports' },
  { key: 'waiter', label: 'Waiter / Bartender', hint: 'Opens tabs, takes orders' },
  { key: 'kitchen', label: 'Kitchen Staff', hint: 'Works the kitchen queue' },
];

interface StaffDraft {
  name: string;
  username: string;
  password: string;
  role: Exclude<StaffRole, 'admin'>;
}

function emptyStaff(role: Exclude<StaffRole, 'admin'> = 'waiter'): StaffDraft {
  return { name: '', username: '', password: '', role };
}

// Named steps instead of magic numbers - 'details' only exists in the sequence when
// staff.length > 0, so the list below is always the actual, current step order and
// there's no separate "skip step 3" branch to fall out of sync with it.
type StepKey = 'business' | 'owner' | 'count' | 'details' | 'review';

export default function SignupScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const { signUp } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 - business
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('Bar');
  const [hasKitchen, setHasKitchen] = useState<boolean | null>(null);

  // Step 2 - owner
  const [ownerName, setOwnerName] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  // Step 3 - staff roster
  const [staffCountInput, setStaffCountInput] = useState('0');
  const [staff, setStaff] = useState<StaffDraft[]>([]);

  function goStaffCount(count: number) {
    const clamped = Math.max(0, Math.min(30, count));
    setStaffCountInput(String(clamped));
    setStaff((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push(emptyStaff());
      next.length = clamped;
      return next;
    });
  }

  function updateStaff(index: number, patch: Partial<StaffDraft>) {
    setStaff((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  // The actual step sequence for this signup, recomputed every render off the
  // current staff count - 'details' is only in the list at all once staffCount > 0.
  const steps: StepKey[] = ['business', 'owner', 'count', ...(staff.length > 0 ? (['details'] as const) : []), 'review'];
  const stepKey = steps[Math.min(stepIndex, steps.length - 1)];
  const isLastStep = stepIndex >= steps.length - 1;

  function canContinueFromStep(key: StepKey): boolean {
    if (key === 'business') return !!businessName.trim() && hasKitchen !== null;
    if (key === 'owner') return !!ownerName.trim() && !!ownerUsername.trim() && ownerPassword.length >= 6;
    if (key === 'count') return true; // staff roster is optional
    if (key === 'details') {
      return staff.every((s) => s.name.trim() && s.username.trim() && s.password.length >= 6);
    }
    return true; // review
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signUp({
        businessName: businessName.trim(),
        businessType,
        ownerName: ownerName.trim(),
        username: ownerUsername.trim(),
        password: ownerPassword,
        restaurantEnabled: !!hasKitchen,
        staff: staff.map((s) => ({
          name: s.name.trim(),
          username: s.username.trim(),
          password: s.password,
          role: s.role,
        })),
      });
      // On success, signUp() sets the authenticated user in AuthContext, which is what
      // actually moves the app on to RootNavigator (see App.tsx) - there's nothing else
      // to navigate to from here.
    } catch (e: any) {
      setError(e.message || 'Could not create your account. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  function next() {
    if (isLastStep) {
      handleSubmit();
      return;
    }
    setError(null);
    setStepIndex(stepIndex + 1);
  }

  function back() {
    if (stepIndex === 0) {
      onBackToLogin();
      return;
    }
    setError(null);
    setStepIndex(stepIndex - 1);
  }

  const progress = (stepIndex + 1) / steps.length;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={back} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {stepKey === 'business' && (
          <View>
            <Text style={styles.stepTitle}>Tell us about your business</Text>
            <Text style={styles.stepSubtitle}>This sets up your owner portal.</Text>

            <Text style={styles.label}>Business name</Text>
            <TextInput
              style={styles.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. The Green Room"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />

            <Text style={styles.label}>Business type</Text>
            <View style={styles.chipRow}>
              {BUSINESS_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, businessType === t && styles.chipSelected]}
                  onPress={() => setBusinessType(t)}
                >
                  <Text style={[styles.chipText, businessType === t && styles.chipTextSelected]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Do you also run a kitchen?</Text>
            <Text style={styles.hint}>This turns on order routing, table management, and the Kitchen Portal.</Text>
            <View style={styles.choiceRow}>
              <TouchableOpacity
                style={[styles.choiceCard, hasKitchen === true && styles.choiceCardSelected]}
                onPress={() => setHasKitchen(true)}
              >
                <Ionicons name="restaurant-outline" size={22} color={hasKitchen === true ? colors.bg : colors.text} />
                <Text style={[styles.choiceText, hasKitchen === true && styles.choiceTextSelected]}>Yes, we serve food</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.choiceCard, hasKitchen === false && styles.choiceCardSelected]}
                onPress={() => setHasKitchen(false)}
              >
                <Ionicons name="beer-outline" size={22} color={hasKitchen === false ? colors.bg : colors.text} />
                <Text style={[styles.choiceText, hasKitchen === false && styles.choiceTextSelected]}>Bar only</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {stepKey === 'owner' && (
          <View>
            <Text style={styles.stepTitle}>Your owner account</Text>
            <Text style={styles.stepSubtitle}>You'll use this to log into the Owner Portal.</Text>

            <Text style={styles.label}>Owner name</Text>
            <TextInput
              style={styles.input}
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="e.g. Chikondi Phiri"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={ownerUsername}
              onChangeText={setOwnerUsername}
              placeholder="e.g. chikondi"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={ownerPassword}
              onChangeText={setOwnerPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
            />
          </View>
        )}

        {stepKey === 'count' && (
          <View>
            <Text style={styles.stepTitle}>How many staff will use the app?</Text>
            <Text style={styles.stepSubtitle}>
              We'll create a login for each of them now. You can always add more later from Settings.
            </Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => goStaffCount(Number(staffCountInput) - 1)}>
                <Ionicons name="remove" size={22} color={colors.text} />
              </TouchableOpacity>
              <TextInput
                style={styles.stepperInput}
                value={staffCountInput}
                onChangeText={(v) => goStaffCount(Number(v.replace(/[^0-9]/g, '')) || 0)}
                keyboardType="number-pad"
              />
              <TouchableOpacity style={styles.stepperBtn} onPress={() => goStaffCount(Number(staffCountInput) + 1)}>
                <Ionicons name="add" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hintCenter}>staff members</Text>
          </View>
        )}

        {stepKey === 'details' && (
          <View>
            <Text style={styles.stepTitle}>Set up your staff</Text>
            <Text style={styles.stepSubtitle}>Each person gets their own portal based on their role.</Text>
            {staff.map((s, i) => (
              <View key={i} style={styles.staffCard}>
                <Text style={styles.staffCardTitle}>Staff member {i + 1}</Text>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={s.name}
                  onChangeText={(v) => updateStaff(i, { name: v })}
                  placeholder="e.g. Grace Banda"
                  placeholderTextColor={colors.textFaint}
                />
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={s.username}
                  onChangeText={(v) => updateStaff(i, { username: v })}
                  placeholder="e.g. grace"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                />
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={s.password}
                  onChangeText={(v) => updateStaff(i, { password: v })}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry
                />
                <Text style={styles.label}>Role</Text>
                <View style={styles.chipRow}>
                  {STAFF_ROLE_OPTIONS.filter((r) => hasKitchen || r.key !== 'kitchen').map((r) => (
                    <TouchableOpacity
                      key={r.key}
                      style={[styles.chip, s.role === r.key && styles.chipSelected]}
                      onPress={() => updateStaff(i, { role: r.key })}
                    >
                      <Text style={[styles.chipText, s.role === r.key && styles.chipTextSelected]}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {stepKey === 'review' && (
          <View>
            <Text style={styles.stepTitle}>Ready to go</Text>
            <Text style={styles.stepSubtitle}>Review before we set everything up.</Text>
            <View style={styles.reviewCard}>
              <ReviewRow label="Business" value={`${businessName} · ${businessType}`} />
              <ReviewRow label="Kitchen" value={hasKitchen ? 'Enabled' : 'Bar only'} />
              <ReviewRow label="Owner" value={`${ownerName} (${ownerUsername})`} />
              <ReviewRow label="Staff accounts" value={staff.length === 0 ? 'None yet' : `${staff.length} account${staff.length > 1 ? 's' : ''}`} />
            </View>
            {staff.length > 0 && (
              <View style={styles.reviewCard}>
                {staff.map((s, i) => (
                  <ReviewRow key={i} label={s.name || `Staff ${i + 1}`} value={STAFF_ROLE_OPTIONS.find((r) => r.key === s.role)?.label || s.role} />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity
          style={[styles.nextButton, !canContinueFromStep(stepKey) && { opacity: 0.5 }]}
          onPress={next}
          disabled={!canContinueFromStep(stepKey) || submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.nextButtonText}>{isLastStep ? 'Create account' : 'Continue'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.lg, gap: spacing.sm },
  backBtn: { padding: 4 },
  progressTrack: { flex: 1, height: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brandGreen },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  stepTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  stepSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: spacing.lg, lineHeight: 18 },
  label: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: spacing.md },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: 2, lineHeight: 16 },
  hintCenter: { color: colors.textFaint, fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
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
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.brandGreen, borderColor: colors.brandGreen },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.bg },
  choiceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  choiceCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: 8,
  },
  choiceCardSelected: { backgroundColor: colors.brandGreen, borderColor: colors.brandGreen },
  choiceText: { color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  choiceTextSelected: { color: colors.bg },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.lg },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: {
    width: 80,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
  },
  staffCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  staffCardTitle: { color: colors.brandGreen, fontWeight: '700', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  reviewLabel: { color: colors.textMuted, fontSize: 13 },
  reviewValue: { color: colors.text, fontSize: 13, fontWeight: '600' },
  errorText: { color: colors.danger, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
  footer: { padding: spacing.lg, paddingTop: spacing.sm },
  nextButton: { backgroundColor: colors.brandGreen, borderRadius: radius.md, paddingVertical: spacing.sm + 4, alignItems: 'center' },
  nextButtonText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
});
