import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Tab, TabItem, InventoryItem, PaymentMethod } from '../types';
import { getTab, getTabItems, addItemToTab, removeTabItem, checkoutTab, cancelTab } from '../api/tabsApi';
import { getAllInventory } from '../api/inventoryApi';
import { colors, spacing, radius } from '../utils/theme';
import { formatCurrency } from '../utils/format';

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: any }[] = [
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
  { key: 'card', label: 'Card', icon: 'card-outline' },
  { key: 'mobile_money', label: 'Mobile Money', icon: 'phone-portrait-outline' },
];

export default function TabDetailScreen({ route, navigation }: any) {
  const { tabId } = route.params;
  const [tab, setTab] = useState<Tab | null>(null);
  const [items, setItems] = useState<TabItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    const [t, tabItems, inv] = await Promise.all([
      getTab(tabId),
      getTabItems(tabId),
      getAllInventory(),
    ]);
    setTab(t);
    setItems(tabItems);
    setInventory(inv);
  }, [tabId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  async function handleAddItem(inv: InventoryItem) {
    if (inv.stockQty <= 0) {
      Alert.alert('Out of stock', `${inv.name} has no stock left.`);
      return;
    }
    try {
      await addItemToTab(tabId, inv.id, 1);
      setPickerVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('Could not add item', e.message);
    }
  }

  async function handleRemoveItem(item: TabItem) {
    await removeTabItem(item.id);
    await load();
  }

  async function handleCheckout(method: PaymentMethod) {
    setProcessing(true);
    try {
      await checkoutTab(tabId, method);
      setPaymentVisible(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Checkout failed', e.message);
    } finally {
      setProcessing(false);
    }
  }

  function handleCancelTab() {
    Alert.alert('Cancel Tab', 'This will remove the tab and restore stock. Continue?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel Tab',
        style: 'destructive',
        onPress: async () => {
          await cancelTab(tabId);
          navigation.goBack();
        },
      },
    ]);
  }

  if (!tab) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.token}>{tab.token}</Text>
          <Text style={styles.customerName}>{tab.customerName || 'Walk-in Customer'}</Text>
        </View>
        <TouchableOpacity onPress={handleCancelTab}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No items added yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.lineItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineItemName}>{item.itemName}</Text>
              <Text style={styles.lineItemMeta}>
                {item.quantity} x {formatCurrency(item.unitPrice)}
              </Text>
            </View>
            <Text style={styles.lineItemTotal}>
              {formatCurrency(item.unitPrice * item.quantity)}
            </Text>
            <TouchableOpacity onPress={() => handleRemoveItem(item)} style={{ marginLeft: spacing.sm }}>
              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.addItemButton} onPress={() => setPickerVisible(true)}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addItemButtonText}>Add Item</Text>
        </TouchableOpacity>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.checkoutButton, items.length === 0 && { opacity: 0.4 }]}
          disabled={items.length === 0}
          onPress={() => setPaymentVisible(true)}
        >
          <Text style={styles.checkoutButtonText}>Checkout</Text>
        </TouchableOpacity>
      </View>

      {/* Item Picker Modal */}
      <Modal visible={pickerVisible} animationType="slide">
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Add Item</Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={inventory}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.md }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.inventoryRow, item.stockQty <= 0 && { opacity: 0.4 }]}
                onPress={() => handleAddItem(item)}
                disabled={item.stockQty <= 0}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.inventoryName}>{item.name}</Text>
                  <Text style={styles.inventoryMeta}>
                    {item.category} · {item.stockQty} {item.unit} left
                  </Text>
                </View>
                <Text style={styles.inventoryPrice}>{formatCurrency(item.price)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal visible={paymentVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Payment Method</Text>
            <Text style={styles.modalSubtitle}>{formatCurrency(total)}</Text>
            {PAYMENT_METHODS.map((pm) => (
              <TouchableOpacity
                key={pm.key}
                style={styles.paymentOption}
                onPress={() => handleCheckout(pm.key)}
                disabled={processing}
              >
                <Ionicons name={pm.icon} size={22} color={colors.primary} />
                <Text style={styles.paymentOptionText}>{pm.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.paymentCancel}
              onPress={() => setPaymentVisible(false)}
              disabled={processing}
            >
              <Text style={styles.paymentCancelText}>Cancel</Text>
            </TouchableOpacity>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  token: { color: colors.primary, fontSize: 20, fontWeight: '700' },
  customerName: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: spacing.xl },
  emptyText: { color: colors.textFaint, fontSize: 14 },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lineItemName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  lineItemMeta: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  lineItemTotal: { color: colors.text, fontSize: 14, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  addItemButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  addItemButtonText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: colors.textMuted, fontSize: 15 },
  totalValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  checkoutButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  checkoutButtonText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
  pickerContainer: { flex: 1, backgroundColor: colors.bg },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inventoryName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  inventoryMeta: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  inventoryPrice: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  modalSubtitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentOptionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  paymentCancel: { alignItems: 'center', padding: spacing.sm, marginTop: spacing.xs },
  paymentCancelText: { color: colors.textMuted, fontSize: 14 },
});
