const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = '30d';

// Roles, from least to most privileged. Matches the StockMate spec:
// Waiter/Bartender -> Cashier -> Manager -> Administrator.
// 'kitchen' sits alongside 'waiter' (not above/below it) - see requireModule below.
const ROLE_RANK = { waiter: 1, kitchen: 1, cashier: 2, manager: 3, admin: 4 };

function signToken(staff) {
  return jwt.sign(
    {
      id: staff.id,
      businessId: staff.businessId,
      name: staff.name,
      username: staff.username,
      role: staff.role,
      isPlatformAdmin: !!staff.isPlatformAdmin,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Express middleware: requires a valid bearer token, attaches req.user. */
function requireAuth(req, res, next) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Express middleware factory: requires req.user's role to be >= minRole. */
function requireRole(minRole) {
  return (req, res, next) => {
    const userRank = ROLE_RANK[req.user?.role] || 0;
    const minRank = ROLE_RANK[minRole] || 999;
    if (userRank < minRank) {
      return res.status(403).json({ error: `Requires ${minRole} role or higher` });
    }
    next();
  };
}

/** Express middleware: requires the platform-owner account (you), not a regular business admin. */
function requirePlatformAdmin(req, res, next) {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}

/**
 * Express middleware factory: requires a business_settings flag to be on before
 * allowing the request through. This is the server-side half of the module gating
 * described in architecture.md section 1 - the client hides the relevant tabs, and
 * this stops the corresponding API routes from being used even if someone calls them
 * directly. Defaults to "off" (safe) for businesses with no settings row yet.
 */
function requireModule(flag) {
  return async (req, res, next) => {
    try {
      const db = getPool();
      const [rows] = await db.query('SELECT * FROM business_settings WHERE businessId = ?', [req.user.businessId]);
      const settings = rows[0];
      if (!settings || !settings[flag]) {
        return res.status(403).json({ error: `This feature isn't enabled for your business yet. Turn it on from Settings.` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Creates the platform-owner account on boot if it doesn't exist yet - not tied to any business. */
async function ensureSeedPlatformAdmin() {
  const db = getPool();
  const username = process.env.PLATFORM_ADMIN_USERNAME;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('PLATFORM_ADMIN_USERNAME/PASSWORD not set - skipping platform admin seed. You will not be able to approve subscription upgrades until you set these and restart.');
    return;
  }

  const [existing] = await db.query('SELECT id FROM staff WHERE username = ?', [username]);
  if (existing.length > 0) return;

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  await db.query(
    'INSERT INTO staff (id, businessId, name, username, passwordHash, role, isPlatformAdmin, active, createdAt) VALUES (?, NULL, ?, ?, ?, ?, 1, 1, ?)',
    [uuidv4(), 'Platform Owner', username, passwordHash, 'admin', now]
  );
  console.log(`Seeded platform admin account - username: "${username}".`);
}

module.exports = {
  signToken,
  requireAuth,
  requireRole,
  requirePlatformAdmin,
  requireModule,
  ensureSeedPlatformAdmin,
  ROLE_RANK,
};
