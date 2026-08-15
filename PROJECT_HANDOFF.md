# StockMate — Project Handoff

Read this first. It explains what StockMate is, what's built, what isn't,
the architecture decisions and *why* they were made, and the exact
frontend↔backend contract so backend work can proceed without breaking
the app. Written so a new agent or developer can pick this up cold.

---

## 1. What this is

A multi-tenant inventory + POS system, currently branded **StockMate**,
originally scoped for bars/restaurants (customer tabs via numbered
wristbands) but generalized to also fit hardware stores, shisha lounges,
grocery shops, etc. Any business can sign up via a landing page, gets a
free trial (200 products), and can request a manual upgrade to unlimited.

Two parts:
- **`/` (repo root)** — the Expo React Native mobile app
- **`/server`** — the Node/Express + MySQL backend + a static landing page

## 2. Current status (as of this handoff)

| Piece | Status |
|---|---|
| Mobile app UI (Home, Tabs, Inventory, Reports, Staff) | ✅ Built, working |
| Local-first offline mode (SQLite + outbox sync) | ✅ Built |
| Backend API (auth, inventory, tabs, sales, subscriptions) | ✅ Built, **not yet deployed** by the user |
| Multi-tenancy (businessId scoping) | ✅ Built |
| Landing page + signup | ✅ Built (`server/public/index.html`), not yet deployed |
| **Login is currently BYPASSED for frontend dev** | ⚠️ See §5 — flip one flag to re-enable |
| Platform-admin dashboard (approve subscription requests) | ❌ Not built — currently requires calling API directly (curl/Postman) |
| Receipts | ❌ Not built |
| Table/floor-plan view | ❌ Not built |
| QR wristband scanning | ❌ Decided against — user is using plain numbered wristbands with a quick-tap number grid instead (already built) |
| AI Assistant / Smart Add (natural language) | ❌ Removed at user's request — was fully built once (Claude API via a small proxy endpoint), can be resurrected from this conversation's history if wanted again |

## 3. Tech stack & why

- **Expo SDK 54, pinned exactly.** The user's Expo Go client only supports
  SDK 54. This was a recurring source of pain during development — Expo Go
  auto-updates on the user's phone but the project doesn't, so every
  `npx expo install` or careless `npm install` risks pulling a newer SDK's
  packages and breaking compatibility. **Every native-linked package in
  `package.json` is pinned to the exact version bundled with SDK 54**
  (verified by extracting `expo@54.0.36`'s own `bundledNativeModules.json`
  rather than guessing). If you add any Expo/native package, look up its
  SDK-54 version the same way before installing — don't just `npm install
  package-name`, which defaults to `^` and can silently pull an
  incompatible newer version. This exact bug happened once already
  (`@react-native-community/netinfo` got installed as `^11.4.1`, which let
  npm resolve `11.5.2`, which SDK 54 rejected).
- **TypeScript**, strict-ish (no `noUnusedParameters`, otherwise defaults).
- **React Navigation** (bottom tabs + native stack), not Expo Router.
- **MySQL** (not Postgres) — user's explicit preference, no other reason.
  Uses `mysql2/promise`. **Important:** `decimalNumbers: true` is set on
  the pool config — without it, MySQL returns `DECIMAL` columns as strings,
  which silently breaks arithmetic in the app.
- **JWT auth**, `bcryptjs` for password hashing, roles as a simple ranked
  enum (`waiter < cashier < manager < admin`).
- **No AI/LLM integration currently** — was built once (Claude API through
  a proxy server endpoint so the API key never touched the client), then
  removed at the user's request to reduce scope. Not currently referenced
  by any file.

## 4. Architecture: local-first, not API-first

This is the most important thing to understand before touching either
side.

**Every screen reads and writes to a local SQLite database on the phone,
never directly to the server.** The files in `src/api/*.ts` (despite the
folder name) do NOT make live HTTP calls for reads or writes on the tabs/
inventory/sales path — they query `src/offline/localDb.ts`'s SQLite
instance, and additionally:
- **Writes** also insert a row into a local `outbox` table describing the
  change, then call `runSync()` (fire-and-forget, non-blocking).
- **`src/offline/syncEngine.ts`** is a background loop that, whenever the
  device is online: (1) drains the outbox by POSTing/PATCHing/DELETEing
  each queued change to the server in order, oldest first, (2) once fully
  drained, pulls fresh inventory/tabs/sales from the server and overwrites
  the local cache with it.

This means: **the UI never blocks on network, works for hours/days
offline, and multiple staff phones eventually converge to the same state**
once they're all online. It also means the server does not need to be
fast or even reachable for the app to feel responsive — it only needs to
be *eventually* reachable.

**The one exception:** `src/screens/StaffScreen.tsx` (staff account
management + subscription status) talks to the server directly, live, no
offline caching. This was a deliberate choice — staff accounts are
inherently a "you need a connection to manage this" feature, not
worth the complexity of syncing.

### Why this matters for backend work

The exact contract the sync engine expects is in one place:
**`src/offline/syncEngine.ts`, the `sendOutboxItem()` function.** It's a
switch statement mapping an outbox "kind" string to an exact HTTP call
(method, path, body shape). This function IS the API contract. If you
change a server route's request/response shape, update this function to
match, or the app will queue changes that fail to sync forever (or worse,
get silently dropped if the server starts returning a 4xx it wasn't
returning before — see the `isPermanentError` logic in the same file,
which treats any 400-499 EXCEPT 402 as "this will never succeed, drop
it"). Be careful adding new 4xx responses to existing endpoints for this
reason.

Similarly, `src/offline/syncEngine.ts`'s `pullLatest()` defines exactly
which server GET endpoints the app depends on for its periodic refresh:
`/api/inventory`, `/api/tabs/open` (+ `/api/tabs/:id/items` per tab),
`/api/sales/export`, `/api/subscription/status`. Changing these
response shapes requires updating `pullLatest()` to match.

## 5. Login is currently bypassed (dev mode)

`src/context/AuthContext.tsx` has a `SKIP_LOGIN_FOR_DEV = true` constant
at the top. While true, the app auto-logs in as a fake local Admin user
and never shows `LoginScreen`. **This was intentional** — the user wanted
to finish frontend work without needing the backend deployed.

**To re-enable real login:** flip `SKIP_LOGIN_FOR_DEV` to `false`. Nothing
else needs to change — the real `signIn`/`signOut`/SecureStore-persistence
code is all still there and untouched, just skipped over.

While bypassed, `StaffScreen` guards its network calls behind
`isServerConfigured()` (checks whether `src/config.ts`'s `SERVER_URL` is
still the placeholder) so it fails quietly instead of showing alarming
error alerts.

## 6. Multi-tenancy model

Every business-owned table (`inventory_items`, `tabs`, `tab_items` via its
parent tab, `sales`, `sale_items` via its parent sale, `staff`) has a
`businessId` column. Every server route filters by
`req.user.businessId` (from the JWT payload — see `server/src/auth.js`'s
`signToken()`). There is no row-level security beyond "every query has a
`WHERE businessId = ?`, written by hand in each route" — if you add a new
route, you must remember to scope it yourself. Nothing enforces this
automatically at the DB layer.

The **platform admin** (you, the StockMate operator) is a special staff
row with `isPlatformAdmin: true` and `businessId: NULL`, seeded from
`PLATFORM_ADMIN_USERNAME`/`PLATFORM_ADMIN_PASSWORD` env vars on first
boot (`server/src/auth.js`'s `ensureSeedPlatformAdmin()`). This account
is the only one that can hit `/api/subscription/platform/*` routes
(list/approve/reject upgrade requests across every business). It cannot
currently log into the mobile app in any meaningful way (it has no
business, so most screens would show empty states) — it's meant for
direct API calls only, for now.

## 7. Subscription / billing model

Deliberately simple, **by the user's explicit choice**: no payment
gateway integration. Businesses pay you out-of-band (bank transfer/mobile
money), then tap "Request Upgrade" in the Staff tab (leaves a free-text
note, e.g. a payment reference), which creates a `subscription_requests`
row. You approve it manually by calling the platform-admin API endpoint.
There is no automated payment verification anywhere in this system by
design — don't add a payment gateway unless the user asks for one.

The 200-product trial limit is enforced **twice**, deliberately:
1. Locally in `src/api/inventoryApi.ts`'s `createInventoryItem()`, using
   a cached copy of the business's subscription status (see
   `business_meta` table in `src/offline/localDb.ts`, refreshed on every
   sync) — gives instant feedback even offline.
2. Server-side in `server/src/routes.inventory.js`'s `POST /` handler —
   the real enforcement, since the local check could be stale or bypassed.

If you touch either, keep both in sync or a device could locally believe
it's under the limit when the server disagrees, which the sync engine
handles (see §4's note on 402) but isn't a great experience.

## 8. What I'd recommend doing next, in order

1. **Deploy the backend before building anything else on it.** Get
   `server/` live on Render (or wherever) against a real MySQL instance
   (PandaStack free tier was the recommendation) with the current code
   completely unchanged first. Confirm `/health` responds, confirm the
   landing page loads, confirm signup creates a business + admin via curl.
   Only after that baseline works should new backend features be added —
   otherwise you can't tell if a bug is from new work or from the
   deploy/config itself.
2. **Flip `SKIP_LOGIN_FOR_DEV` back to `false`** and confirm a real signup
   → login → full app flow works end to end on a real device.
3. **Build the platform-admin dashboard** (a simple screen or even just a
   couple of authenticated HTML pages served from `server/public/`) so
   subscription approvals don't require manual curl commands. This is the
   most obviously-missing piece for the user to actually operate the
   business.
4. From there, the user's own stated roadmap (subject to change): receipts,
   table/floor-plan view. AI features were explicitly cut — don't
   reintroduce without asking.

## 9. Known rough edges / things I didn't get to

- No automated tests anywhere (frontend or backend).
- No rate limiting, no `helmet`-style hardening on the Express server.
- No password-reset flow — if a staff member forgets their password, an
  admin has no way to reset it yet (would need a new endpoint).
- Render's free tier sleeps after inactivity — first request after a
  quiet period takes 30-60s. Fine for dev, worth flagging to the user
  before they show this to a real customer.
- `server/public/index.html`'s pricing section has placeholder copy
  ("Contact us for pricing") — the user hasn't given real pricing/payment
  account details yet.
- The Reports/Home screens compute aggregates (today's summary, top
  sellers) by querying the local SQLite cache directly with `SUM`/`GROUP
  BY`, not via any server aggregate endpoint for reads (the server *does*
  have `/api/sales/today-summary` and `/api/sales/top-items` routes, but
  they're currently unused by the app — the offline-first `salesApi.ts`
  computes everything from the local cache instead, populated by
  `/api/sales/export`). This is intentional (see §4) but looks like dead
  code in the server if you're not aware of why it's there — it isn't
  dead, `getStaffPerformance`/`staff-performance` route is the only truly
  unused one and could be wired into a future staff-performance screen.

## 10. File map

```
App.tsx                          - entry point: local DB init -> AuthProvider -> (LoginScreen | RootNavigator)
src/
  api/                           - "API" layer that's actually mostly local-first (see §4)
    client.ts                    - low-level fetch wrapper, holds the JWT in memory
    authApi.ts, inventoryApi.ts, salesApi.ts, subscriptionApi.ts, tabsApi.ts
  offline/
    localDb.ts                   - local SQLite schema (mirrors server schema) + outbox table
    netStatus.ts                 - online/offline detection (NetInfo wrapper)
    syncEngine.ts                - THE contract file, see §4
  context/AuthContext.tsx        - login state, SKIP_LOGIN_FOR_DEV flag lives here
  navigation/RootNavigator.tsx   - tab structure, role-based tab visibility
  screens/                       - one file per screen, fairly self-contained
  components/Logo.tsx, SyncStatusBanner.tsx
  types/index.ts                 - shared TS types (InventoryItem, Tab, Sale, etc.)
  utils/theme.ts, format.ts
  config.ts                      - SERVER_URL - placeholder until deployed

server/
  index.js                       - Express app entry, wires routes + static landing page
  src/
    db.js                        - MySQL pool + schema (CREATE TABLE IF NOT EXISTS)
    auth.js                      - JWT signing/verifying, role middleware, platform-admin seed
    routes.auth.js                - signup, login, staff CRUD
    routes.inventory.js           - inventory CRUD + trial limit enforcement
    routes.tabs.js                 - tabs, tab items, checkout, cancel
    routes.sales.js                - reports/aggregates + /export (used by app sync)
    routes.subscription.js         - trial status, upgrade requests, platform-admin approval
  public/index.html               - landing page + signup form (static, served at "/")
  README.md                       - deployment instructions, env vars, roles table
```

## 11. Environment variables the backend needs

See `server/README.md` for the full table — summary:
`DATABASE_URL` (or `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`),
`JWT_SECRET`, `PLATFORM_ADMIN_USERNAME`, `PLATFORM_ADMIN_PASSWORD`. None
have safe defaults for the platform admin credentials on purpose — the
server logs a warning and skips seeding if they're missing, rather than
falling back to something guessable.
