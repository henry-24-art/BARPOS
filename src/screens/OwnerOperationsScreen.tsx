import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useState, useCallback } from 'react';
import { BusinessSettings } from '../types';
import { getBusinessSettings } from '../api/settingsApi';
import { colors, spacing, radius } from '../utils/theme';

interface OperationCard {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  show?: boolean;
}

/**
 * Owner/manager landing pad for jumping into the same operational screens that
 * bar and kitchen staff use day-to-day, so an owner can see exactly what their
 * floor sees without living in either portal full-time.
 */
export default function OwnerOperationsScreen({ navigation }: any) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  useFocusEffect(
    useCallback(() => {
      getBusinessSettings().then(setSettings);
    }, [])
  );

  const cards: OperationCard[] = [
    { key: 'tabs', title: 'Bar Tabs', description: 'Open tabs, add items, take payment', icon: 'beer-outline', route: 'OwnerTabs' },
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
    },
    {
      key: 'kitchen',
      title: 'Kitchen Queue',
      description: "What the kitchen is working on right now",
      icon: 'restaurant-outline',
      route: 'OwnerKitchen',
      show: !!settings?.restaurantEnabled,
    },
    { key: 'inventory', title: 'Inventory', description: 'Stock levels and pricing', icon: 'cube-outline', route: 'OwnerInventory' },
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
});
