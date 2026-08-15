import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../../screens/HomeScreen';
import OwnerOperationsScreen from '../../screens/OwnerOperationsScreen';
import TabsScreen from '../../screens/TabsScreen';
import TabDetailScreen from '../../screens/TabDetailScreen';
import TablesScreen from '../../screens/TablesScreen';
import BarQueueScreen from '../../screens/BarQueueScreen';
import KitchenScreen from '../../screens/KitchenScreen';
import InventoryScreen from '../../screens/InventoryScreen';
import SpiritsScreen from '../../screens/SpiritsScreen';
import ReportsScreen from '../../screens/ReportsScreen';
import SettingsScreen from '../../screens/SettingsScreen';
import { colors } from '../../utils/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// A single stack so any operational screen reached from the Operations hub can push
// TabDetail on top of it (e.g. tapping a tab from OwnerTabs or OwnerTables).
function OperationsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OperationsHub" component={OwnerOperationsScreen} />
      <Stack.Screen name="OwnerTabs" component={TabsScreen} options={{ headerShown: true, title: 'Bar Tabs' }} />
      <Stack.Screen name="OwnerTables" component={TablesScreen} options={{ headerShown: true, title: 'Tables' }} />
      <Stack.Screen name="OwnerBarQueue" component={BarQueueScreen} options={{ headerShown: true, title: 'Bar Queue' }} />
      <Stack.Screen name="OwnerKitchen" component={KitchenScreen} options={{ headerShown: true, title: 'Kitchen Queue' }} />
      <Stack.Screen name="OwnerInventory" component={InventoryScreen} options={{ headerShown: true, title: 'Inventory' }} />
      <Stack.Screen name="OwnerSpirits" component={SpiritsScreen} options={{ headerShown: true, title: 'Spirit Tracking' }} />
      <Stack.Screen name="TabDetail" component={TabDetailScreen} options={{ headerShown: true, title: 'Tab' }} />
    </Stack.Navigator>
  );
}

function OverviewStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OverviewMain" component={HomeScreen} />
    </Stack.Navigator>
  );
}

function ReportsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ReportsMain" component={ReportsScreen} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function OwnerPortalNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brandGreen,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => {
          let iconName: any = 'ellipse';
          if (route.name === 'Overview') iconName = 'home-outline';
          else if (route.name === 'Operations') iconName = 'apps-outline';
          else if (route.name === 'Reports') iconName = 'bar-chart-outline';
          else if (route.name === 'Settings') iconName = 'settings-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Overview" component={OverviewStack} />
      <Tab.Screen name="Operations" component={OperationsStack} />
      <Tab.Screen name="Reports" component={ReportsStack} />
      <Tab.Screen name="Settings" component={SettingsStack} />
    </Tab.Navigator>
  );
}
