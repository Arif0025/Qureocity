import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import AdminDashboard from './src/screens/AdminDashboard';
import StaffDashboard from './src/screens/StaffDashboard';
import { StaffSessionProvider, useStaffSession } from './src/auth/StaffSession';
import { supabaseConfigError } from './src/lib/supabase';
import { colors } from './src/theme/tokens';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const C = colors;

function NativeApp() {
  const { status, profile, signIn, signOut } = useStaffSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  if (status === 'loading') {
    return <View style={styles.loading}><ActivityIndicator size="large" color={C.plum} /></View>;
  }

  if (status === 'signed-in' && profile) {
    return profile.role === 'admin'
      ? <AdminDashboard employeeName={profile.name} onSignOut={signOut} />
      : <StaffDashboard employeeName={profile.name} onSignOut={signOut} />;
  }

  const submit = async () => {
    if (supabaseConfigError) { setError(supabaseConfigError); return; }
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setError('');
    setSigningIn(true);
    try {
      await signIn(email.trim(), password);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled">
          <Image source={require('./assets/qureocity-login.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="QureoCity" />
          <Text style={styles.eyebrow}>STAFF PORTAL</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to continue to your workspace.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              onSubmitEditing={() => undefined}
              placeholder="you@qureocity.com"
              placeholderTextColor={C.muted}
              returnKeyType="next"
              style={styles.input}
              value={email}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              placeholder="Enter your password"
              placeholderTextColor={C.muted}
              returnKeyType="go"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={signingIn} onPress={() => void submit()} style={({ pressed }) => [styles.button, pressed && styles.pressed, signingIn && styles.disabled]}>
              {signingIn ? <ActivityIndicator color={C.white} /> : <Text style={styles.buttonText}>Sign in</Text>}
            </Pressable>
          </View>
          <Text style={styles.footer}>QureoCity staff access</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StaffSessionProvider>
        <NativeApp />
      </StaffSessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: C.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.canvas },
  loginContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 36 },
  logo: { width: 150, height: 64, alignSelf: 'center', marginBottom: 34 },
  eyebrow: { color: C.plum, fontSize: 10, fontWeight: '900', letterSpacing: 1.8, textAlign: 'center' },
  title: { color: C.ink, fontSize: 29, lineHeight: 36, fontWeight: '900', textAlign: 'center', marginTop: 9 },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7 },
  form: { marginTop: 32 },
  label: { color: C.ink, fontSize: 12, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 15, color: C.ink, fontSize: 14 },
  error: { color: C.coral, fontSize: 12, lineHeight: 18, marginTop: 12 },
  button: { minHeight: 52, borderRadius: 15, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { color: C.white, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.65 },
  footer: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 30 },
});
