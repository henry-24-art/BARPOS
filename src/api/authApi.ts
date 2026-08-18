import { apiRequest } from './client';

// 'kitchen' sits alongside 'waiter' (not above/below it) - it's the kitchen-staff
// counterpart to bar-side waiter/bartender duties, gated by business_settings.restaurantEnabled
// rather than by rank. See AuthContext's ROLE_RANK and RootNavigator's module gating.
export type StaffRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen';

export interface AuthUser {
  id: string;
  businessId: string | null;
  name: string;
  username: string;
  role: StaffRole;
  isPlatformAdmin?: boolean;
}

export async function login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  return apiRequest('/api/auth/login', { method: 'POST', body: { username, password } });
}

/**
 * Minimal staff-creation call (admin only), re-added here so the 'kitchen' role - introduced
 * for the restaurant module - is actually assignable from somewhere. Used by SettingsScreen.
 */
export async function createStaffAccount(input: {
  name: string;
  username: string;
  password: string;
  role: StaffRole;
}): Promise<void> {
  await apiRequest('/api/auth/staff', { method: 'POST', body: input });
}

export interface StaffMember {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
}

/** Lists every staff account in the caller's business (admin only). */
export async function listStaff(): Promise<StaffMember[]> {
  const { staff } = await apiRequest('/api/auth/staff', { method: 'GET' });
  return staff;
}

/** Changes an existing staff member's role and/or active status (admin only). */
export async function updateStaffAccount(id: string, input: { role?: StaffRole; active?: boolean }): Promise<void> {
  await apiRequest(`/api/auth/staff/${id}`, { method: 'PUT', body: input });
}

export interface NewStaffMember {
  name: string;
  username: string;
  password: string;
  role: Exclude<StaffRole, 'admin'>;
}

/**
 * Changes the logged-in user's own password. Server verifies currentPassword
 * against the stored hash before writing the new one, so this can't be used
 * to overwrite someone else's password even with a valid token for another route.
 */
export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  await apiRequest('/api/auth/me/password', { method: 'PUT', body: input });
}

export async function signup(input: {
  businessName: string;
  businessType: string;
  ownerName: string;
  username: string;
  password: string;
  restaurantEnabled?: boolean;
  staff?: NewStaffMember[];
}): Promise<{ token: string; user: AuthUser; staffCreated: { id: string; name: string; username: string; role: StaffRole }[] }> {
  return apiRequest('/api/auth/signup', { method: 'POST', body: input });
}

