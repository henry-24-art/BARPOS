import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setAuthToken } from '../api/client';
import { login as loginApi, signup as signupApi, AuthUser, StaffRole, NewStaffMember } from '../api/authApi';

const TOKEN_KEY = 'stockmate_auth_token';
const USER_KEY = 'stockmate_auth_user';

const ROLE_RANK: Record<StaffRole, number> = { waiter: 1, kitchen: 1, cashier: 2, manager: 3, admin: 4 };

// Which portal a role lands in after login. This is the single source of truth for
// portal routing - RootNavigator reads it to decide which stack to mount.
export type Portal = 'owner' | 'bar' | 'kitchen';

export function portalForRole(role: StaffRole): Portal {
  if (role === 'kitchen') return 'kitchen';
  if (role === 'admin' || role === 'manager') return 'owner';
  return 'bar'; // cashier, waiter
}

// DEV-ONLY: skips the Sign In screen and auto-logs in as a fake Admin, so the
// frontend can be built and tested without a deployed server. Flipped off now
// that there's a real Sign In / Create Account flow to test against a deployed
// server - flip back to true only if you need to work on UI with no server at all.
const SKIP_LOGIN_FOR_DEV = false;
const DEV_USER: AuthUser = {
  id: 'dev-user',
  businessId: 'dev-business',
  name: 'Dev Admin',
  username: 'dev',
  role: 'admin',
};

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (input: {
    businessName: string;
    businessType: string;
    ownerName: string;
    username: string;
    password: string;
    restaurantEnabled?: boolean;
    staff?: NewStaffMember[];
  }) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (minRole: StaffRole) => boolean;
  portal: Portal | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (SKIP_LOGIN_FOR_DEV) {
      setUser(DEV_USER);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [token, userJson] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (token && userJson) {
          setAuthToken(token);
          setUser(JSON.parse(userJson));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const { token, user: loggedInUser } = await loginApi(username, password);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(loggedInUser));
    setAuthToken(token);
    setUser(loggedInUser);
  }, []);

  const signUp = useCallback(async (input: Parameters<AuthContextValue['signUp']>[0]) => {
    const { token, user: newUser } = await signupApi(input);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(newUser));
    setAuthToken(token);
    setUser(newUser);
  }, []);

  const signOut = useCallback(async () => {
    if (SKIP_LOGIN_FOR_DEV) return; // no-op while login is bypassed
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    setAuthToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (minRole: StaffRole) => {
      if (!user) return false;
      return ROLE_RANK[user.role] >= ROLE_RANK[minRole];
    },
    [user]
  );

  const portal = user ? portalForRole(user.role) : null;

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, hasRole, portal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
