/**
 * Sign in / create account against Better Auth (email + password). New accounts
 * route through the gate to profile-setup; returning users land on the app.
 * See design.md §Auth, §5 Components (Input, Button).
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, FadeIn, Input } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { haptics } from '@/lib/haptics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const onSubmit = async () => {
    if (isSignup && name.trim().length < 2) {
      setError('Enter your name');
      haptics.error();
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address');
      haptics.error();
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      haptics.error();
      return;
    }

    setError(null);
    setSubmitting(true);

    const { error: authError } = isSignup
      ? await authClient.signUp.email({ email: email.trim(), password, name: name.trim() })
      : await authClient.signIn.email({ email: email.trim(), password });

    setSubmitting(false);

    if (authError) {
      setError(authError.message ?? 'Something went wrong. Please try again.');
      haptics.error();
      return;
    }

    haptics.success();
    // The gate routes new accounts to profile-setup and returning users home.
    router.replace('/');
  };

  const toggleMode = () => {
    haptics.selection();
    setError(null);
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing['3xl'], paddingBottom: insets.bottom + Spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View
            style={[
              styles.mark,
              theme.isDark
                ? { backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.border }
                : { backgroundColor: theme.brandDeep },
            ]}>
            <Ionicons name="water" size={32} color={theme.isDark ? theme.brand : '#fff'} />
          </View>
          <ThemedText type="display" style={styles.title}>
            {isSignup ? 'Create account' : 'Welcome back'}
          </ThemedText>
          <ThemedText type="body" color="textSecondary" style={styles.subtitle}>
            {isSignup
              ? 'Join DonorNet and start saving lives.'
              : 'Sign in to keep saving lives with DonorNet.'}
          </ThemedText>
        </FadeIn>

        <FadeIn delay={80} style={styles.form}>
          {isSignup ? (
            <Input
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Alex Rivera"
              autoCapitalize="words"
              autoComplete="name"
              icon="person-outline"
            />
          ) : null}
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            icon="mail-outline"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            icon="lock-closed-outline"
            hint={isSignup ? 'At least 8 characters' : undefined}
            error={error ?? undefined}
          />
        </FadeIn>

        <FadeIn delay={140} style={styles.actions}>
          <Button
            label={isSignup ? 'Create account' : 'Sign in'}
            onPress={onSubmit}
            loading={submitting}
            fullWidth
            size="lg"
          />
          <PressableScale
            onPress={toggleMode}
            haptic={false}
            accessibilityRole="button"
            accessibilityLabel={isSignup ? 'Switch to sign in' : 'Switch to create account'}
            style={styles.switchRow}>
            <ThemedText type="footnote" color="textSecondary">
              {isSignup ? 'Already have an account?' : 'New to DonorNet?'}
            </ThemedText>
            <ThemedText type="footnote" color="brand" style={styles.switchLink}>
              {isSignup ? 'Sign in' : 'Create one'}
            </ThemedText>
          </PressableScale>
        </FadeIn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing['2xl'],
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: { marginBottom: Spacing.xs },
  subtitle: {},
  form: { gap: Spacing.base },
  actions: { gap: Spacing.lg },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xs },
  switchLink: { fontWeight: '600' },
});
