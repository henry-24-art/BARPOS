import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { subscribeSyncState, SyncStatus } from '../offline/syncEngine';
import { colors, spacing, radius } from '../utils/theme';

const CONFIG: Record<SyncStatus, { icon: any; label: string; color: string }> = {
  idle: { icon: 'checkmark-circle', label: 'Synced', color: colors.brandGreen },
  syncing: { icon: 'sync', label: 'Syncing...', color: colors.brandBlue },
  offline: { icon: 'cloud-offline-outline', label: 'Offline', color: colors.warning },
  error: { icon: 'alert-circle', label: 'Sync error', color: colors.danger },
};

export default function SyncStatusBanner() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    return subscribeSyncState((s) => {
      setStatus(s.status);
      setPendingCount(s.pendingCount);
    });
  }, []);

  // Only take up space when there's something worth flagging - otherwise the
  // dashboard's own layout should breathe. Idle/synced with nothing pending is silent.
  if (status === 'idle' && pendingCount === 0) return null;

  const cfg = CONFIG[status];
  return (
    <View style={[styles.container, { borderColor: cfg.color }]}>
      <Ionicons name={cfg.icon} size={14} color={cfg.color} />
      <Text style={[styles.text, { color: cfg.color }]}>
        {cfg.label}
        {pendingCount > 0 ? ` · ${pendingCount} change${pendingCount === 1 ? '' : 's'} pending` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  text: { fontSize: 11, fontWeight: '600' },
});
