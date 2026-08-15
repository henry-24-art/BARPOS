import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { InventoryItem, ProductType } from '../types';
import { getAllInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem } from '../api/inventoryApi';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../utils/theme';
import { formatCurrency } from '../utils/format';

const PRODUCT_TYPES: { key: ProductType; label: string }[] = [
  { key: 'beer', label: 'Beer' },
  { key: 'spirit', label: 'Spirit' },
  { key: 'wine', label: 'Wine' },
  { key: 'soft_drink', label: 'Soft Drink' },
  { key: 'food', label: 'Food' },
  { key: 'ingredient', label: 'Ingredient' },
];

const EMPTY_FORM = {
  name: '',
  category: '',
  price: '',
  cost: '',
  stockQty: '',
  lowStockThreshold: '',
  unit: '',
  productType: 'beer' as ProductType,
};

export default function InventoryScreen({ navigation }: any) {
  const { hasRole } = useAuth();
  const canEdit = hasRole('manager');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await getAllInventory();
    setItems(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function openAddModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEditModal(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      price: String(item.price),
      cost: String(item.cost),
      stockQty: String(item.stockQty),
      lowStockThreshold: String(item.lowStockThreshold),
      unit: item.unit,
      productType: item.productType,
    });
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price.trim()) {
      Alert.alert('Missing info', 'Name and price are required.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        category: form.category.trim() || 'General',
        price: parseFloat(form.price) || 0,
        cost: parseFloat(form.cost) || 0,
        stockQty: parseFloat(form.stockQty) || 0,
        lowStockThreshold: parseFloat(form.lowStockThreshold) || 5,
        unit: form.unit.trim() || 'unit',
        productType: form.productType,
      };
      if (editingId) {
        await updateInventoryItem(editingId, data);
      } else {
        await createInventoryItem(data);
      }
      setModalVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('Could not save item', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!editingId) return;
    Alert.alert('Delete Item', 'This will remove the item from inventory. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteInventoryItem(editingId);
          setModalVisible(false);
          await load();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        {canEdit && (
          <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
            <Ionicons name="add" size={22} color={colors.bg} />
            <Text style={styles.addButtonText}>Add Item</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => {
          const isLow = item.stockQty <= item.lowStockThreshold;
          return (
            <TouchableOpacity
              style={styles.itemCard}
              onPress={() => canEdit && openEditModal(item)}
              activeOpacity={canEdit ? 0.6 : 1}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>
                  {item.category} · {formatCurrency(item.price)} / {item.unit} · {PRODUCT_TYPES.find((p) => p.key === item.productType)?.label ?? item.productType}
                </Text>
              </View>
              <View style={[styles.stockBadge, isLow && styles.stockBadgeLow]}>
                {isLow && <Ionicons name="alert-circle" size={12} color={colors.danger} />}
                <Text style={[styles.stockBadgeText, isLow && styles.stockBadgeTextLow]}>
                  {item.stockQty} {item.unit}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={modalVisible} animationType="slide">
        <ScrollView style={styles.formContainer} contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.xl }}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{editingId ? 'Edit Item' : 'New Inventory Item'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Carlsberg Green" />
          <Field label="Category" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="e.g. Beer, Food, Spirits" />
          <View style={styles.row}>
            <Field label="Selling Price (MWK)" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} placeholder="0" keyboardType="numeric" style={{ flex: 1 }} />
            <Field label="Cost Price (MWK)" value={form.cost} onChangeText={(v) => setForm({ ...form, cost: v })} placeholder="0" keyboardType="numeric" style={{ flex: 1 }} />
          </View>
          <View style={styles.row}>
            <Field label="Stock Qty" value={form.stockQty} onChangeText={(v) => setForm({ ...form, stockQty: v })} placeholder="0" keyboardType="numeric" style={{ flex: 1 }} />
            <Field label="Low Stock Alert" value={form.lowStockThreshold} onChangeText={(v) => setForm({ ...form, lowStockThreshold: v })} placeholder="5" keyboardType="numeric" style={{ flex: 1 }} />
          </View>
          <Field label="Unit" value={form.unit} onChangeText={(v) => setForm({ ...form, unit: v })} placeholder="e.g. bottle, plate, shot" />

          <Text style={styles.fieldLabel}>Product Type</Text>
          <Text style={styles.fieldHint}>
            Determines routing when this app's restaurant mode is on: Food goes to the kitchen queue, everything
            else goes to the bar queue. Spirit additionally enables bottle-level tracking.
          </Text>
          <View style={styles.chipRow}>
            {PRODUCT_TYPES.map((pt) => {
              const selected = form.productType === pt.key;
              return (
                <TouchableOpacity
                  key={pt.key}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setForm({ ...form, productType: pt.key })}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{pt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Item'}</Text>
          </TouchableOpacity>

          {editingId && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Text style={styles.deleteButtonText}>Delete Item</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </Modal>
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  style?: any;
}

function Field({ label, style, ...props }: FieldProps) {
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} placeholderTextColor={colors.textFaint} {...props} />
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
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  itemMeta: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  stockBadgeLow: { backgroundColor: 'rgba(229,72,77,0.12)' },
  stockBadgeText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  stockBadgeTextLow: { color: colors.danger },
  formContainer: { flex: 1, backgroundColor: colors.bg },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  formTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  fieldLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 6 },
  fieldHint: { color: colors.textFaint, fontSize: 11, marginBottom: spacing.sm, lineHeight: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.brandGreen, borderColor: colors.brandGreen },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: colors.bg },
  fieldInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
  deleteButton: { alignItems: 'center', padding: spacing.md, marginBottom: spacing.xl },
  deleteButtonText: { color: colors.danger, fontWeight: '600', fontSize: 14 },
});
