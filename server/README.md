# StockMate Server

Multi-tenant backend for StockMate: any business (bar, hardware store,
shisha lounge, grocery shop, etc.) can sign up via the landing page, gets
a free trial (200 products), and can request an upgrade to the unlimited
plan, which you approve manually after confirming payment.

Also handles: MySQL database, staff login (JWT), role-based permissions
(Admin / Manager / Cashier / Waiter), and syncing every staff device's
data in real time (with full offline support baked into the app).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes* | `mysql://user:password@host:port/dbname` |
| `DB_HOST` etc. | Yes* | Alternative to `DATABASE_URL` — `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| `JWT_SECRET` | Yes | Any long random string — signs staff login tokens |
| `PLATFORM_ADMIN_USERNAME` | Yes | **Your** login (not tied to any single business) — used to approve subscription upgrades across every business on the platform |
| `PLATFORM_ADMIN_PASSWORD` | Yes | Password for the above — set a real one, there's no insecure default |

\* Set either `DATABASE_URL` OR the individual `DB_*` variables.

## Run it locally

```bash
cd server
npm install
export DATABASE_URL=mysql://user:pass@localhost:3306/stockmate
export JWT_SECRET=some-long-random-string
export PLATFORM_ADMIN_USERNAME=yourname
export PLATFORM_ADMIN_PASSWORD=pick-a-real-password
npm start
```

Visit `http://localhost:3000` to see the landing page and signup form.

## The landing page

`server/public/index.html` is a static marketing page + signup form,
served directly from this server at `/`. It posts to `/api/auth/signup`,
which creates a new business (on a 200-product free trial) and its first
admin account in one step. No separate hosting needed — deploying the
server deploys the landing page too.

Edit `server/public/index.html` directly to change copy, pricing text, or
add your real payment details (bank account / mobile money number) in the
pricing section.

## How signup and billing work

1. A business owner fills out the form on the landing page → `POST
   /api/auth/signup` → a `businesses` row is created (`subscriptionStatus:
   'trial'`, `productLimit: 200`) plus their first `admin` staff account.
2. They log into the mobile app with the username/password they chose.
3. Once they've added 200 products, further additions are blocked (both
   the app's local check and the server both enforce this) with a message
   pointing them to the Staff tab.
4. From the **Staff** tab (admin only), they tap **Request Upgrade**,
   optionally leaving a payment reference note. This creates a pending
   `subscription_requests` row.
5. You (the platform admin — not a business admin) log in with
   `PLATFORM_ADMIN_USERNAME`/`PASSWORD` and review pending requests via:
   - `GET /api/subscription/platform/requests?status=pending`
   - `POST /api/subscription/platform/requests/:id/approve`
   - `POST /api/subscription/platform/requests/:id/reject`

   There's no admin UI screen for this yet — for now, call these
   endpoints directly (e.g. with `curl` or Postman) using your platform
   admin token. Ask me to build a small admin dashboard screen for this
   whenever you want one.
6. Approving sets `subscriptionStatus: 'active'` and removes the product
   limit entirely for that business.

## Multi-tenancy

Every table (`inventory_items`, `tabs`, `sales`, etc.) is scoped by
`businessId`. Every API route filters by the logged-in staff member's
`businessId`, so Business A can never see Business B's data. The platform
admin account (`isPlatformAdmin: true`, `businessId: NULL`) is the only
account that can see across businesses, and only via the
`/api/subscription/platform/*` routes.

## Getting a free MySQL database

Most "free MySQL hosting" (shared PHP hosts, 000Webhost, etc.) blocks
remote connections and won't work here. You need a **managed** MySQL
database with external access:

- **[PandaStack](https://pandastack.io)** — free tier includes one managed
  MySQL 8 database with external access.

## Deploy the server

1. Push this `server` folder to a GitHub repo.
2. [render.com](https://render.com) → New + → Web Service → connect the repo.
3. Build Command: `npm install`. Start Command: `npm start`.
4. Add the environment variables from the table above.
5. Deploy. Render gives you a URL like `https://stockmate-server.onrender.com`
   — that's both your landing page URL and your app's `SERVER_URL`.
6. In the mobile app, open `src/config.ts` and set `SERVER_URL` to that URL.

## Roles (within a business)

| Role | Access |
|------|--------|
| Waiter / Bartender | Tabs (open, add items, checkout) |
| Cashier | + Inventory (view only), Reports |
| Manager | + Inventory (add/edit/delete) |
| Administrator | + Staff management, subscription/upgrade requests |

## Security notes

- Never commit real values of `JWT_SECRET`, `DATABASE_URL`,
  `PLATFORM_ADMIN_PASSWORD` to git.
- The platform admin account can see subscription data for every business
  on the platform — treat that password with real care.
