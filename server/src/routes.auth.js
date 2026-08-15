const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./db');
const { signToken, requireAuth, requireRole } = require('./auth');

const router = express.Router();

// POST /api/auth/signup - public. Creates a new business, its owner/admin account,
// the business's module settings, and (optionally) the rest of the staff roster in
// one call, so an owner can set the whole business up during registration instead of
// adding staff one-by-one afterwards from Settings.
// body: {
//   businessName, businessType, ownerName, username, password,
//   restaurantEnabled?: boolean,       // business has a kitchen -> also enables table management
//   staff?: [{ name, username, password, role }]   // role: 'manager'|'cashier'|'waiter'|'kitchen'
// }
router.post('/signup', async (req, res) => {
  const { businessName, businessType, ownerName, username, password, restaurantEnabled, staff: staffRoster } = req.body || {};
  if (!businessName || !businessType || !ownerName || !username || !password) {
    return res.status(400).json({ error: 'businessName, businessType, ownerName, username, and password are all required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const roster = Array.isArray(staffRoster) ? staffRoster : [];
  const validRoles = ['manager', 'cashier', 'waiter', 'kitchen'];
  for (const member of roster) {
    if (!member || !member.name || !member.username || !member.password || !validRoles.includes(member.role)) {
      return res.status(400).json({ error: 'Each staff member needs a name, username, password, and a valid role' });
    }
    if (member.password.length < 6) {
      return res.status(400).json({ error: `Password for ${member.name} must be at least 6 characters` });
    }
  }

  // Check every username in this signup (owner + roster) against the DB and against
  // each other up front, so we fail before creating anything rather than partway through.
  const allUsernames = [username, ...roster.map((m) => m.username)];
  const uniqueUsernames = new Set(allUsernames.map((u) => u.toLowerCase()));
  if (uniqueUsernames.size !== allUsernames.length) {
    return res.status(400).json({ error: 'Usernames must be unique across your staff' });
  }

  const db = getPool();
  const [existing] = await db.query('SELECT username FROM staff WHERE username IN (?)', [allUsernames]);
  if (existing.length > 0) {
    return res.status(409).json({ error: `Username already taken: ${existing[0].username}` });
  }

  const now = new Date().toISOString();
  const businessId = uuidv4();
  await db.query(
    `INSERT INTO businesses (id, name, businessType, subscriptionStatus, productLimit, trialStartedAt, createdAt)
     VALUES (?, ?, ?, 'trial', 200, ?, ?)`,
    [businessId, businessName, businessType, now, now]
  );

  const kitchenOn = !!restaurantEnabled;
  await db.query(
    `INSERT INTO business_settings (businessId, restaurantEnabled, spiritTrackingEnabled, tableManagementEnabled)
     VALUES (?, ?, 1, ?)`,
    [businessId, kitchenOn ? 1 : 0, kitchenOn ? 1 : 0]
  );

  const staffId = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  await db.query(
    `INSERT INTO staff (id, businessId, name, username, passwordHash, role, isPlatformAdmin, active, createdAt)
     VALUES (?, ?, ?, ?, ?, 'admin', 0, 1, ?)`,
    [staffId, businessId, ownerName, username, passwordHash, now]
  );

  const createdStaff = [];
  for (const member of roster) {
    const memberId = uuidv4();
    const memberHash = await bcrypt.hash(member.password, 10);
    await db.query(
      `INSERT INTO staff (id, businessId, name, username, passwordHash, role, isPlatformAdmin, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`,
      [memberId, businessId, member.name, member.username, memberHash, member.role, now]
    );
    createdStaff.push({ id: memberId, name: member.name, username: member.username, role: member.role });
  }

  const staff = { id: staffId, businessId, name: ownerName, username, role: 'admin', isPlatformAdmin: false };
  const token = signToken(staff);
  res.status(201).json({
    token,
    user: { id: staff.id, businessId, name: ownerName, username, role: 'admin' },
    business: { id: businessId, name: businessName, businessType, subscriptionStatus: 'trial', productLimit: 200 },
    staffCreated: createdStaff,
  });
});

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = getPool();
  const [rows] = await db.query('SELECT * FROM staff WHERE username = ? LIMIT 1', [username]);
  const staff = rows[0];
  if (!staff || !staff.active) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, staff.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = signToken(staff);
  res.json({
    token,
    user: {
      id: staff.id,
      businessId: staff.businessId,
      name: staff.name,
      username: staff.username,
      role: staff.role,
      isPlatformAdmin: !!staff.isPlatformAdmin,
    },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// GET /api/auth/staff - list staff for the caller's own business (admin only)
router.get('/staff', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(
    'SELECT id, name, username, role, active, createdAt FROM staff WHERE businessId = ? ORDER BY createdAt ASC',
    [req.user.businessId]
  );
  res.json({ staff: rows.map((r) => ({ ...r, active: !!r.active })) });
});

// POST /api/auth/staff - create a new staff account within the caller's business (admin only)
router.post('/staff', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, username, password, role } = req.body || {};
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'name, username, password, and role are required' });
  }
  if (!['admin', 'manager', 'cashier', 'waiter', 'kitchen'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const db = getPool();
  const [existing] = await db.query('SELECT id FROM staff WHERE username = ?', [username]);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  await db.query(
    'INSERT INTO staff (id, businessId, name, username, passwordHash, role, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    [id, req.user.businessId, name, username, passwordHash, role, now]
  );

  res.status(201).json({ id, name, username, role, active: true, createdAt: now });
});

// PUT /api/auth/staff/:id - update role/active status, scoped to the caller's own business (admin only)
router.put('/staff/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { role, active } = req.body || {};
  const db = getPool();

  const [owned] = await db.query('SELECT id FROM staff WHERE id = ? AND businessId = ?', [req.params.id, req.user.businessId]);
  if (owned.length === 0) return res.status(404).json({ error: 'Staff member not found' });

  const fields = [];
  const values = [];
  if (role !== undefined) {
    fields.push('role = ?');
    values.push(role);
  }
  if (active !== undefined) {
    fields.push('active = ?');
    values.push(active ? 1 : 0);
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.params.id);
  await db.query(`UPDATE staff SET ${fields.join(', ')} WHERE id = ?`, values);
  res.json({ ok: true });
});

module.exports = router;
