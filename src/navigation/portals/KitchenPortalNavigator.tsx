import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import KitchenScreen from '../../screens/KitchenScreen';
import TablesScreen from '../../screens/TablesScreen';
import { colors } from '../../utils/theme';
import { BusinessSettings } from '../../types';
import { getBusinessSettings } from '../../api/settingsApi';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function KitchenStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="KitchenMain" component={KitchenScreen} />
    </Stack.Navigator>
  );
}

function TablesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="KitchenTablesList" component={TablesScreen} />
    </Stack.Navigator>
  );
}

/**
 * Kitchen staff's own portal - kept deliberately small. This is where the fixed
 * daily menu + per-table order flow (next phase) will live; for now it's the
 * existing kitchen queue plus a read view of tables so kitchen staff know which
 * table each ticket belongs to.
 */
export default function KitchenPortalNavigator() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBusinessSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const showTables = !!settings?.tableManagementEnabled;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brandGreen,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => {
          let iconName: any = 'restaurant-outline';
          if (route.name === 'TablesTab') iconName = 'grid-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Kitchen" component={KitchenStack} options={{ title: 'Kitchen' }} />
      {showTables && <Tab.Screen name="TablesTab" component={TablesStack} options={{ title: 'Tables' }} />}
    </Tab.Navigator>
  );
}
