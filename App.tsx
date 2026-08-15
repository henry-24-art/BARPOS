import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Image, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { initLocalSchema } from './src/offline/localDb';
import { startSyncEngine } from './src/offline/syncEngine';
import { colors } from './src/utils/theme';

function AppContent() {
  const { user, loading } = useAuth();
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    if (user) startSyncEngine();
  }, [user]);

  useEffect(() => {
    if (user) setShowSignup(false); // reset so a future sign-out lands back on Login
  }, [user]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Image source={require('./assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <ActivityIndicator size="large" color={colors.brandGreen} style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (user) return <RootNavigator />;

  return showSignup ? (
    <SignupScreen onBackToLogin={() => setShowSignup(false)} />
  ) : (
    <LoginScreen onSignupPress={() => setShowSignup(true)} />
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initLocalSchema();
        setDbReady(true);
      } catch (e: any) {
        setDbError(e.message ?? 'Failed to initialize local storage');
      }
    })();
  }, []);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to start: {dbError}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.center}>
        <Image source={require('./assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <ActivityIndicator size="large" color={colors.brandGreen} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  logo: { width: 120, height: 120 },
  errorText: { color: colors.danger, padding: 24, textAlign: 'center' },
});
