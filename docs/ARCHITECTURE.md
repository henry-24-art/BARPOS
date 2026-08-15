# StockMate Hospitality — Technical Architecture

Stack: **React** (frontend) + **Node.js/Express** (API) + **MySQL** (database) + **Socket.IO** (real-time order status).

One codebase, one backend, one database, multi-tenant via `business_id`, feature-gated by `business_type` + `role`.

---

## 1. Core Design Principles

- **Every table that holds business data carries a `business_id`.** All queries are scoped by the authenticated user's business — this is the multi-tenancy boundary. No cross-business reads/writes, enforced at the query layer, not just the UI.
- **Feature gating is data-driven, not hardcoded per business.** A `business_settings` row holds flags (`restaurant_enabled`, `spirit_tracking_enabled`, etc.) computed from `business_type` at signup, and both API middleware and frontend nav read from it.
- **RBAC is middleware, not per-route checks.** A single `requireRole([...])` and `requireModule([...])` pair guards every route; handlers assume the check already passed.
- **Order splitting is structural, not conditional logic sprinkled through the code.** One `orders` row + N `order_items` rows, each item tagged `bar` or `kitchen` by product type at insert time. Bar staff and kitchen staff query their own item subset; the bill always aggregates from `order_items`.
- **Spirit deduction is a side effect of order-item completion, not POS button logic.** Whenever an `order_item` of type `SPIRIT` is marked sold, a `spirit_transactions` row is written and the spirit's remaining volume is a derived/materialized value — never edited directly.

---

## 2. Database Schema (MySQL)

### 2.1 Core / Auth

```sql
CREATE TABLE businesses (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(150) NOT NULL,
  owner_name    VARCHAR(150) NOT NULL,
  phone         VARCHAR(30) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  business_type ENUM('BAR_ONLY','BAR_RESTAURANT') NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Derived feature flags, written once at signup, editable later in Settings
CREATE TABLE business_settings (
  business_id           BIGINT PRIMARY KEY,
  restaurant_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  spirit_tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  table_management_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  currency              VARCHAR(10) NOT NULL DEFAULT 'MWK',
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE users (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  business_id   BIGINT NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  phone         VARCHAR(30),
  email         VARCHAR(150),
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('OWNER','BARTENDER','WAITER','KITCHEN_STAFF') NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  INDEX idx_business_role (business_id, role)
);
```

Only the Owner account is created at signup; Owner creates all other `users` rows via Staff Management (POST /users), setting `role` explicitly. There is no self-service role picker anywhere in the app.

### 2.2 Products, Categories, Inventory

```sql
CREATE TABLE categories (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  business_id BIGINT NOT NULL,
  name        VARCHAR(100) NOT NULL,
  module      ENUM('BAR','KITCHEN') NOT NULL,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE products (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  business_id     BIGINT NOT NULL,
  category_id     BIGINT,
  name            VARCHAR(150) NOT NULL,
  product_type    ENUM('BEER','SPIRIT','WINE','SOFT_DRINK','FOOD','INGREDIENT') NOT NULL,
  selling_price   DECIMAL(12,2) NOT NULL,
  cost_price      DECIMAL(12,2) NOT NULL,
  current_stock   DECIMAL(12,2) NOT NULL DEFAULT 0,   -- units for non-spirit; bottles for spirit
  min_stock_level DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_business_type (business_id, product_type)
);
```

`product_type` is the single source of truth used everywhere for routing: `FOOD`→kitchen, everything else (`BEER`,`SPIRIT`,`WINE`,`SOFT_DRINK`)→bar, `SPIRIT` additionally triggers spirit-tracking behavior. `INGREDIENT` is stock-only, never sold directly — it's decremented via a future recipe/BOM feature, out of scope for v1.

### 2.3 Spirit Tracking

```sql
CREATE TABLE spirits (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  business_id     BIGINT NOT NULL,
  product_id      BIGINT NOT NULL,           -- FK to products, product_type = SPIRIT
  brand           VARCHAR(100),
  bottle_size_ml  INT NOT NULL,
  shot_size_ml    INT NOT NULL DEFAULT 50,
  bottles_in_stock DECIMAL(10,2) NOT NULL,   -- allows fractional open bottles
  min_bottle_level DECIMAL(10,2) NOT NULL DEFAULT 2,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Append-only ledger: every sale, delivery, or adjustment is a row.
-- Remaining volume is always SUM(this table), never stored/edited directly.
CREATE TABLE spirit_transactions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  spirit_id     BIGINT NOT NULL,
  type          ENUM('SALE','RESTOCK','ADJUSTMENT') NOT NULL,
  volume_ml     DECIMAL(10,2) NOT NULL,   -- negative for SALE/negative ADJUSTMENT, positive for RESTOCK
  order_item_id BIGINT NULL,              -- set when type = SALE
  user_id       BIGINT NOT NULL,
  note          VARCHAR(255),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spirit_id) REFERENCES spirits(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_spirit_created (spirit_id, created_at)
);

-- Physical stock verification events (variance audit trail)
CREATE TABLE spirit_stock_checks (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  spirit_id         BIGINT NOT NULL,
  expected_volume_ml DECIMAL(10,2) NOT NULL,
  actual_volume_ml   DECIMAL(10,2) NOT NULL,
  difference_ml      DECIMAL(10,2) NOT NULL,  -- actual - expected
  user_id            BIGINT NOT NULL,
  note               VARCHAR(255),
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spirit_id) REFERENCES spirits(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Design note on the ledger approach:** rather than storing a single `remaining_ml` column and decrementing it in place, every movement is an immutable row in `spirit_transactions`. Remaining volume = `bottles_in_stock × bottle_size_ml + SUM(volume_ml)`. This gives you the full audit trail the spec asks for (section 9) for free, avoids race conditions when two bartenders sell from the same spirit concurrently, and means a `spirit_stock_checks` variance event never has to guess what the "expected" figure was at any point in time — it's just a query.

**Open-bottle edge case (flagged in my earlier review):** `bottles_in_stock` is decimal, not integer, so "9.2 bottles remaining" is a real stored/derived value, not just a display rounding. When a bartender opens a new bottle, they log a `RESTOCK`-adjacent action that increments `bottles_in_stock` by 1 — this is a deliberate manual step (not automatic), because the system can't know a new physical bottle was opened until a human says so. Physical stock checks compare against `bottles_in_stock` count *plus* the ledger math, so disputes ("I only opened one bottle") are resolvable by looking at the restock log timestamp.

### 2.4 Tables (Bar & Restaurant only)

```sql
CREATE TABLE restaurant_tables (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  business_id BIGINT NOT NULL,
  label       VARCHAR(50) NOT NULL,        -- "Table 5"
  status      ENUM('AVAILABLE','ORDER_IN_PROGRESS','ACTIVE_ORDER','AWAITING_PAYMENT') NOT NULL DEFAULT 'AVAILABLE',
  current_order_id BIGINT NULL,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);
```

### 2.5 Orders

```sql
CREATE TABLE orders (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  business_id   BIGINT NOT NULL,
  table_id      BIGINT NULL,               -- NULL for bar-only walk-up orders
  waiter_id     BIGINT NULL,                -- NULL if bartender created it directly (bar-only mode)
  status        ENUM('OPEN','SENT','IN_PROGRESS','READY','DELIVERED','PAID','CANCELLED') NOT NULL DEFAULT 'OPEN',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at     TIMESTAMP NULL,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  FOREIGN KEY (waiter_id) REFERENCES users(id)
);

CREATE TABLE order_items (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id      BIGINT NOT NULL,
  product_id    BIGINT NOT NULL,
  route         ENUM('BAR','KITCHEN') NOT NULL,   -- derived from product_type at insert time
  quantity      INT NOT NULL,
  unit_price    DECIMAL(12,2) NOT NULL,           -- snapshot at time of sale
  notes         VARCHAR(255),
  status        ENUM('NEW','ACCEPTED','PREPARING','READY','DELIVERED') NOT NULL DEFAULT 'NEW',
  assigned_to   BIGINT NULL,                       -- bartender/kitchen staff who accepted it
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  INDEX idx_order_route_status (order_id, route, status)
);
```

**This is the structural implementation of section 12 (Order Routing).** One `orders` row per table/customer visit. Each line item is individually routed and individually tracked through its own status lifecycle. The bartender's screen is `SELECT * FROM order_items WHERE route='BAR' AND business_id=? AND status IN (...)`; kitchen's screen is the same query with `route='KITCHEN'`. The bill is `SUM(order_items.quantity * order_items.unit_price) WHERE order_id=?` — always one number regardless of how many items were bar vs. kitchen.

### 2.6 Payments & Expenses

```sql
CREATE TABLE payments (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id      BIGINT NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  method        ENUM('CASH','AIRTEL_MONEY','TNM_MPAMBA','CARD') NOT NULL,
  received_by   BIGINT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE TABLE expenses (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  business_id   BIGINT NOT NULL,
  description   VARCHAR(255) NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  recorded_by   BIGINT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);
```

---

## 3. State Machines

### 3.1 `order_items.status` (per bar or kitchen line item — sections 4 & 6)

```
NEW → ACCEPTED → PREPARING → READY → DELIVERED
```

- Written by bartender for `route=BAR` items, kitchen staff for `route=KITCHEN` items.
- A waiter can never change this status — read-only to them, pushed via Socket.IO.
- `READY` triggers a socket event `order_item:ready` to the waiter who owns the parent order.

### 3.2 `orders.status` (whole-order / whole-bill lifecycle)

```
OPEN → SENT → IN_PROGRESS → READY → DELIVERED → PAID
                                            ↘ CANCELLED (from OPEN/SENT only)
```

- `OPEN`: waiter is building the order (adding items), not yet visible to bar/kitchen.
- `SENT`: waiter submits; items fan out to bar/kitchen queues by `route`.
- `IN_PROGRESS`: at least one item is `PREPARING`.
- `READY`: derived — true when every item's status is `READY` or `DELIVERED`.
- `DELIVERED`: waiter confirms all items physically brought to table.
- `PAID`: a `payments` row (or rows) sums to ≥ order total; table (if any) reverts to `AVAILABLE`.

`orders.status` is intentionally a coarse rollup for the waiter/owner view; the real granularity lives in `order_items.status`.

### 3.3 `restaurant_tables.status` (section 8)

```
AVAILABLE → ORDER_IN_PROGRESS → ACTIVE_ORDER → AWAITING_PAYMENT → AVAILABLE
```

Driven directly by the linked order's lifecycle:
- Waiter opens table → `ORDER_IN_PROGRESS`
- Order `SENT` → `ACTIVE_ORDER`
- Order `DELIVERED` → `AWAITING_PAYMENT`
- Order `PAID` → `AVAILABLE`, `current_order_id` cleared

### 3.4 Spirit ledger (not a state machine, but a derived-value pipeline)

```
remaining_ml(spirit) = bottles_in_stock × bottle_size_ml
                        + SUM(spirit_transactions.volume_ml)
```

Every `order_item` of a SPIRIT product transitioning to `DELIVERED` (or `PREPARING`, configurable — recommend deducting at `PREPARING` since that's when the bartender physically pours) triggers an INSERT into `spirit_transactions` with `volume_ml = -(shot_size_ml × quantity)`.

---

## 4. RBAC & Module-Gating Middleware

```js
// middleware/auth.js
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized for this role' });
    }
    next();
  };
}

function requireModule(...flags) {
  return async (req, res, next) => {
    const settings = await getBusinessSettings(req.user.business_id); // cached
    const missing = flags.filter(f => !settings[f]);
    if (missing.length) {
      return res.status(403).json({ error: `Module not enabled: ${missing.join(', ')}` });
    }
    next();
  };
}
```

Applied per route, composably:

```js
router.get('/tables', requireModule('table_management_enabled'), requireRole('OWNER','WAITER'), tablesController.list);
router.post('/staff', requireRole('OWNER'), staffController.create);
router.patch('/order-items/:id/status', requireRole('BARTENDER','KITCHEN_STAFF'), orderItemsController.updateStatus);
```

`updateStatus` internally checks `route` matches the caller's role (bartender can only touch `route=BAR` items, kitchen only `route=KITCHEN`) — this is the enforcement point for "kitchen staff should never see drink preparation orders."

Frontend nav (section 15) reads the same `business_settings` object (returned on login) plus `req.user.role` to decide which sidebar items render — single source of truth shared by both layers, so there's never a mismatch between what the API allows and what the UI shows.

---

## 5. API Route Map

```
AUTH
POST   /auth/register-business      (creates business + owner user + business_settings)
POST   /auth/login
GET    /auth/me

STAFF (Owner only)
GET    /users
POST   /users
PATCH  /users/:id            (deactivate, change role)

PRODUCTS & CATEGORIES (Owner: full CRUD; others: read-only where relevant)
GET/POST/PATCH/DELETE  /categories
GET/POST/PATCH/DELETE  /products

SPIRITS
GET    /spirits
POST   /spirits                          (Owner)
POST   /spirits/:id/restock              (Owner/Bartender — logs bottle-open event)
POST   /spirits/:id/stock-check          (Owner/Bartender — variance check)
GET    /spirits/:id/transactions         (movement history)
GET    /spirits/:id/summary              (remaining ml, equivalent bottles, low-stock flag)

TABLES  (requireModule table_management_enabled)
GET    /tables
POST   /tables/:id/open                  (Waiter)
POST   /tables/:id/close                 (Waiter, after PAID)

ORDERS
POST   /orders                           (Waiter/Bartender — creates OPEN order)
POST   /orders/:id/items                 (add item; server derives route from product_type)
POST   /orders/:id/send                  (OPEN → SENT, fans out to queues)
GET    /orders/:id
GET    /orders?status=&table_id=

ORDER ITEMS (queues)
GET    /order-items?route=BAR&status=NEW,ACCEPTED,PREPARING     (Bartender queue)
GET    /order-items?route=KITCHEN&status=NEW,ACCEPTED,PREPARING (Kitchen queue)
PATCH  /order-items/:id/status           (Bartender/Kitchen — advances state machine)

PAYMENTS
POST   /orders/:id/payments              (Waiter/Owner)

INVENTORY
GET    /inventory                        (current stock across product types)
GET    /inventory/low-stock

EXPENSES  (Owner)
GET/POST /expenses

REPORTS  (Owner)
GET    /reports/sales?period=daily|weekly|monthly
GET    /reports/sales/bar
GET    /reports/sales/restaurant
GET    /reports/inventory/movement
GET    /reports/spirits/consumption
GET    /reports/spirits/variances
GET    /reports/staff-activity

DASHBOARD
GET    /dashboard                        (aggregates: today's sales, active orders, low stock, top products)
```

---

## 6. Real-Time Layer (Socket.IO)

The spec requires instant status visibility across roles (sections 4, 5, 6) — this can't be polling-only without noticeable lag, so:

- One Socket.IO namespace per `business_id`, joined on login.
- Server emits on every `order_items.status` change: `order_item:updated { order_item_id, order_id, status, route }`.
- Waiter clients listen for updates on orders they created; bar/kitchen clients listen for new items entering their `route` queue (`order_item:new`).
- Fallback: a 10–15s polling interval as a safety net for flaky connections, since this is a mobile/tablet app that may run on inconsistent venue wifi — sockets reconnect silently and the poll catches anything missed in between.

**Offline mode is out of scope for v1** per this doc, but flagged here as a known gap from my earlier review: if venues have unreliable connectivity, a true offline-first mode (local queue + sync) would be a phase-2 investment, not a v1 requirement, since it changes the data model (conflict resolution) significantly.

---

## 7. Suggested Folder Structure

```
stockmate-hospitality/
├── server/
│   ├── config/           (db pool, socket setup)
│   ├── middleware/        (auth, requireRole, requireModule)
│   ├── models/            (SQL query modules per table)
│   ├── controllers/
│   ├── routes/
│   ├── sockets/
│   └── app.js
├── client/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── contexts/       (AuthContext holds user + business_settings)
│   │   ├── pages/
│   │   │   ├── owner/
│   │   │   ├── bartender/
│   │   │   ├── waiter/
│   │   │   └── kitchen/
│   │   ├── hooks/           (useSocket, useOrderQueue)
│   │   └── App.jsx
│   └── package.json
└── package.json
```

---

## 8. Build Sequence (recommended)

1. Auth + business setup + RBAC middleware + dynamic nav shell
2. Products/categories/inventory CRUD
3. Orders + order_items + routing + bar/kitchen queues + Socket.IO
4. Table management (if Bar & Restaurant)
5. Spirit tracking (transactions ledger + stock checks)
6. Payments
7. Reports & dashboard aggregation

This mirrors dependency order — orders need products, spirits need order_items to exist, reports need everything.
