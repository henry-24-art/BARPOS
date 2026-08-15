import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../utils/theme';

export default function LoginScreen({ onSignupPress }: { onSignupPress?: () => void }) {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[colors.brandBlueDark, colors.bg]}
        style={styles.gradientTop}
      />
      <View style={styles.content}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.wordmark}>
          Stock<Text style={{ color: colors.brandGreen }}>Mate</Text>
        </Text>
        <Text style={styles.subtitle}>Sign in to your staff account</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. admin"
            placeholderTextColor={colors.textFaint}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.textFaint}
            onSubmitEditing={handleLogin}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.loginButton, (!username.trim() || !password || loading) && { opacity: 0.5 }]}
            onPress={handleLogin}
            disabled={!username.trim() || !password || loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {onSignupPress && (
            <TouchableOpacity style={styles.signupLink} onPress={onSignupPress}>
              <Text style={styles.signupLinkText}>
                Setting up a new business? <Text style={{ color: colors.brandGreen, fontWeight: '700' }}>Create an account</Text>
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  gradientTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  logo: { width: 90, height: 90, marginBottom: spacing.sm },
  wordmark: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: spacing.xl },
  form: { width: '100%', maxWidth: 360 },
  label: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  errorText: { color: colors.danger, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
  loginButton: {
    backgroundColor: colors.brandGreen,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  loginButtonText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
  signupLink: { marginTop: spacing.lg, alignItems: 'center' },
  signupLinkText: { color: colors.textMuted, fontSize: 13 },
});
