// StockMate backend - multi-tenant SaaS: shared MySQL data, staff auth,
// business signup/trial/subscription, and the public landing page.
//
// Deploy this anywhere that can run Node (Render, Railway, Fly.io, a VPS, etc).
// Required environment variables:
//   DATABASE_URL           - mysql://user:pass@host:port/dbname (or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME individually)
//   JWT_SECRET              - any long random string, used to sign login tokens
//   PLATFORM_ADMIN_USERNAME - your own login to approve subscription upgrades across all businesses
//   PLATFORM_ADMIN_PASSWORD - password for the above (set a real one, no default)

const path = require('path');
const express = require('express');
const cors = require('cors');

const { initSchema } = require('./src/db');
const { ensureSeedPlatformAdmin } = require('./src/auth');
const authRoutes = require('./src/routes.auth');
const inventoryRoutes = require('./src/routes.inventory');
const tabsRoutes = require('./src/routes.tabs');
const salesRoutes = require('./src/routes.sales');
const subscriptionRoutes = require('./src/routes.subscription');
const tablesRoutes = require('./src/routes.tables');
const spiritsRoutes = require('./src/routes.spirits');
const expensesRoutes = require('./src/routes.expenses');
const settingsRoutes = require('./src/routes.settings');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Public landing page + signup form (served as static files, e.g. index.html at "/")
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/tabs', tabsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/spirits', spiritsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/settings', settingsRoutes);

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await initSchema();
    await ensureSeedPlatformAdmin();
    app.listen(PORT, () => {
      console.log(`StockMate server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
