import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../utils/theme';
import OwnerPortalNavigator from './portals/OwnerPortalNavigator';
import BarPortalNavigator from './portals/BarPortalNavigator';
import KitchenPortalNavigator from './portals/KitchenPortalNavigator';

const navTheme = {
  dark: true,
  colors: {
    primary: colors.brandGreen,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.brandGreen,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '800' as const },
  },
};

/**
 * Top-level dispatcher: every staff member lands in their own portal on login,
 * chosen by role (see portalForRole in AuthContext), instead of one shared tab bar
 * with tabs conditionally shown/hidden per role. Owner/manager -> Owner Portal
 * (cross-visibility into bar + kitchen, reports, staff). Cashier/waiter -> Bar
 * Portal. Kitchen staff -> Kitchen Portal.
 */
export default function RootNavigator() {
  const { portal } = useAuth();

  return (
    <NavigationContainer theme={navTheme}>
      {portal === 'kitchen' ? (
        <KitchenPortalNavigator />
      ) : portal === 'owner' ? (
        <OwnerPortalNavigator />
      ) : (
        <BarPortalNavigator />
      )}
    </NavigationContainer>
  );
}
