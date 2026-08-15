export type PaymentMethod = 'cash' | 'card' | 'mobile_money';

// Matches architecture.md's product_type enum. FOOD routes to the kitchen,
// everything else routes to the bar; SPIRIT additionally drives the spirit ledger.
export type ProductType = 'beer' | 'spirit' | 'wine' | 'soft_drink' | 'food' | 'ingredient';
export type ProductModule = 'bar' | 'kitchen';

export function moduleForProductType(type: ProductType): ProductModule {
  return type === 'food' ? 'kitchen' : 'bar';
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  price: number; // unit selling price
  cost: number; // unit cost price
  stockQty: number;
  lowStockThreshold: number;
  unit: string; // e.g. "bottle", "plate", "shot"
  productType: ProductType;
  createdAt: string;
  updatedAt: string;
}

export type TabStatus = 'open' | 'closed';

export interface Tab {
  id: string;
  token: string; // band/token number or description e.g. "Table 4", "Band #12"
  customerName?: string;
  status: TabStatus;
  openedAt: string;
  closedAt?: string;
  paymentMethod?: PaymentMethod;
  total?: number;
  tableId?: string; // set when this tab/order was opened from a restaurant table
}

// One order_item.status state machine per architecture.md section 3.1:
// new -> accepted -> preparing -> ready -> delivered.
// Bar staff advance 'bar' route items, kitchen staff advance 'kitchen' route items.
export type OrderItemStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'delivered';

export interface TabItem {
  id: string;
  tabId: string;
  inventoryItemId: string;
  itemName: string; // denormalized snapshot
  unitPrice: number; // snapshot at time of add
  quantity: number;
  addedAt: string;
  route: ProductModule; // derived from the product's productType at insert time, not chosen by staff
  status: OrderItemStatus;
  productType: ProductType;
}

// Restaurant table lifecycle per architecture.md section 3.3, driven by the linked
// tab/order's status rather than set directly by staff.
export type TableStatus = 'available' | 'order_in_progress' | 'active_order' | 'awaiting_payment';

export interface RestaurantTable {
  id: string;
  label: string; // e.g. "Table 5"
  status: TableStatus;
  currentTabId?: string;
}

// Append-only ledger per architecture.md section 2.3 - remaining volume is always
// derived from bottlesInStock + SUM(spirit_transactions.volumeMl), never edited directly.
export type SpiritTransactionType = 'sale' | 'restock' | 'adjustment';

export interface Spirit {
  id: string;
  inventoryItemId: string; // FK to the SPIRIT-type inventory item
  brand?: string;
  bottleSizeMl: number;
  shotSizeMl: number;
  bottlesInStock: number; // decimal - fractional open bottles are real values, not display rounding
  minBottleLevel: number;
}

export interface SpiritTransaction {
  id: string;
  spiritId: string;
  type: SpiritTransactionType;
  volumeMl: number; // negative for sale/negative adjustment, positive for restock
  tabItemId?: string; // set when type = sale
  note?: string;
  createdAt: string;
}

export interface SpiritStockCheck {
  id: string;
  spiritId: string;
  expectedVolumeMl: number;
  actualVolumeMl: number;
  differenceMl: number; // actual - expected
  note?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  createdAt: string;
}

// Feature-gating flags per architecture.md section 1: data-driven, not hardcoded
// per business. Both nav and (once deployed) API middleware read from this.
export interface BusinessSettings {
  restaurantEnabled: boolean;
  spiritTrackingEnabled: boolean;
  tableManagementEnabled: boolean;
}

export interface Sale {
  id: string;
  tabId: string;
  token: string;
  customerName?: string;
  paymentMethod: PaymentMethod;
  subtotal: number;
  total: number;
  closedAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  inventoryItemId: string;
  itemName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface DailySummary {
  date: string;
  totalSales: number;
  totalTransactions: number;
  cashTotal: number;
  cardTotal: number;
  mobileMoneyTotal: number;
}
