import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../../screens/HomeScreen';
import TabsScreen from '../../screens/TabsScreen';
import TabDetailScreen from '../../screens/TabDetailScreen';
import TablesScreen from '../../screens/TablesScreen';
import BarQueueScreen from '../../screens/BarQueueScreen';
import InventoryScreen from '../../screens/InventoryScreen';
import SpiritsScreen from '../../screens/SpiritsScreen';
import ReportsScreen from '../../screens/ReportsScreen';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../utils/theme';
import { BusinessSettings } from '../../types';
import { getBusinessSettings } from '../../api/settingsApi';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const DEFAULT_SETTINGS: BusinessSettings = {
  restaurantEnabled: false,
  spiritTrackingEnabled: true,
  tableManagementEnabled: false,
};

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
    </Stack.Navigator>
  );
}

function TabsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TabsList" component={TabsScreen} />
      <Stack.Screen name="TabDetail" component={TabDetailScreen} />
    </Stack.Navigator>
  );
}

function TablesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TablesList" component={TablesScreen} />
      <Stack.Screen name="TabDetail" component={TabDetailScreen} />
    </Stack.Navigator>
  );
}

function InventoryStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InventoryList" component={InventoryScreen} />
    </Stack.Navigator>
  );
}

/**
 * Bar-side portal: waiters/bartenders and cashiers. No Kitchen tab, no Settings -
 * this is the "own portal" for front-of-house bar staff, kept to what they actually
 * do day-to-day (StockMate spec: waiter = tabs/orders, cashier = + inventory/reports view).
 */
export default function BarPortalNavigator() {
  const { hasRole, user } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const s = await getBusinessSettings();
        if (!cancelled) setSettings(s);
      } catch {
        // local db not ready yet - defaults stay in place
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const showTables = settings.restaurantEnabled && settings.tableManagementEnabled;
  const showBarQueue = settings.restaurantEnabled;
  const showInventory = hasRole('cashier');
  const showSpirits = settings.spiritTrackingEnabled && hasRole('cashier');
  const showReports = hasRole('cashier');

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brandGreen,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => {
          let iconName: any = 'ellipse';
          if (route.name === 'Home') iconName = 'home-outline';
          else if (route.name === 'TabsTab') iconName = 'beer-outline';
          else if (route.name === 'TablesTab') iconName = 'grid-outline';
          else if (route.name === 'BarQueue') iconName = 'flame-outline';
          else if (route.name === 'InventoryTab') iconName = 'cube-outline';
          else if (route.name === 'Spirits') iconName = 'wine-outline';
          else if (route.name === 'Reports') iconName = 'bar-chart-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="TabsTab" component={TabsStack} options={{ title: 'Tabs' }} />
      {showTables && <Tab.Screen name="TablesTab" component={TablesStack} options={{ title: 'Tables' }} />}
      {showBarQueue && <Tab.Screen name="BarQueue" component={BarQueueScreen} options={{ title: 'Bar' }} />}
      {showInventory && <Tab.Screen name="InventoryTab" component={InventoryStack} options={{ title: 'Inventory' }} />}
      {showSpirits && <Tab.Screen name="Spirits" component={SpiritsScreen} />}
      {showReports && <Tab.Screen name="Reports" component={ReportsScreen} />}
    </Tab.Navigator>
  );
}
