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

export interface NewStaffMember {
  name: string;
  username: string;
  password: string;
  role: Exclude<StaffRole, 'admin'>;
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

