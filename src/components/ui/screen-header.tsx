import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from './pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  trailing?: React.ReactNode;
  large?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  showBack,
  onBack,
  trailing,
  large = true,
}: ScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // Nothing to go back to — the screen was reached by `replace` (posting a
    // request lands on it that way), a deep link, or a web reload, which drops
    // the in-app stack. A back button that silently does nothing reads as a
    // frozen screen, so it goes home instead. Straight to the tab rather than
    // via "/", whose gate would send a staff account to the console.
    router.replace('/(tabs)/home');
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {showBack ? (
          <PressableScale
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={[styles.iconButton, { backgroundColor: theme.surfaceSunken }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </PressableScale>
        ) : (
          <View style={styles.spacer} />
        )}
        {trailing ?? <View style={styles.spacer} />}
      </View>
      <View style={styles.titleBlock}>
        <ThemedText type={large ? 'display' : 'title2'}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="callout" color="textSecondary" style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.base },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { width: 40, height: 40 },
  titleBlock: { gap: Spacing.xs },
  subtitle: { maxWidth: '92%' },
});
