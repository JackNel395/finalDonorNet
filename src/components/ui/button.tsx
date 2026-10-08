import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * `dangerGhost` is a destructive action without the fill: the label and the
 * danger colour still mark it, but it does not shout. For a destructive action
 * repeated once per row or card, where a dozen solid red fills would outrank
 * the screen's actual primary action.
 */
/**
 * `dangerOutline` is the reversible-but-serious action: it reads as dangerous
 * without claiming the weight of the filled `danger`, so a pair like
 * "Suspend" / "Delete" can state which one cannot be undone.
 */
/**
 * `success` is the affirmative counterpart to `danger`: a solid fill for a
 * confirming action whose consequence is a *record*, not a deletion — "Mark
 * complete" writes a donation and restarts an eligibility countdown. It is
 * green rather than brand red because on a screen where the destructive twin
 * is red, two red fills side by side say nothing about which is which.
 */
/**
 * `successSoft` is `dangerOutline`'s affirmative counterpart: a tinted fill and
 * a matching outline for the confirming action in a row of consequential ones
 * ("Mark fulfilled" beside "Close" and "Take down"), so the good outcome is
 * distinguishable from the destructive ones without competing with the
 * screen's primary action for weight.
 */
type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'success'
  | 'successSoft'
  | 'danger'
  | 'dangerGhost'
  | 'dangerOutline'
  | 'inverse';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * Overrides `label` as the accessible name. For a button whose visible text
   * repeats across a list ("View" on every card in a grid), so each one still
   * announces what it acts on.
   */
  accessibilityLabel?: string;
  style?: ViewStyle;
};

const HEIGHT: Record<Size, number> = { sm: 40, md: 48, lg: 56 };
const PADDING: Record<Size, number> = { sm: Spacing.base, md: Spacing.lg, lg: Spacing.xl };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  disabled,
  icon,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  // Loading keeps the variant's fill (with a spinner); only a truly disabled
  // button drops to the quiet sunken treatment.
  const showDisabled = disabled && !loading;

  const bg: Record<Variant, string> = {
    primary: theme.brand,
    secondary: theme.surface,
    ghost: 'transparent',
    success: theme.success,
    successSoft: theme.successSubtle,
    danger: theme.danger,
    dangerGhost: 'transparent',
    dangerOutline: theme.surface,
    // Fixed white-on-ink pairing for placement on brandDeep panels — identical
    // in both themes so deep-navy heroes always get a crisp CTA.
    inverse: '#FFFFFF',
  };
  const fg: Record<Variant, string> = {
    primary: theme.onBrand,
    secondary: theme.text,
    ghost: theme.brand,
    success: theme.onSuccess,
    successSoft: theme.success,
    danger: theme.onBrand,
    dangerGhost: theme.danger,
    dangerOutline: theme.danger,
    inverse: Colors.light.brandDeep,
  };

  const background = showDisabled ? theme.surfaceSunken : bg[variant];
  const foreground = showDisabled ? theme.textTertiary : fg[variant];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={isDisabled}
      haptic={
        variant === 'primary' ||
        variant === 'success' ||
        variant === 'danger' ||
        variant === 'dangerGhost' ||
        variant === 'dangerOutline'
          ? 'medium'
          : 'light'
      }
      onPress={onPress}
      style={[
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: PADDING[size],
          backgroundColor: background,
          borderWidth:
            (variant === 'secondary' ||
              variant === 'dangerOutline' ||
              variant === 'successSoft') &&
            !showDisabled
              ? StyleSheet.hairlineWidth
              : 0,
          borderColor:
            variant === 'dangerOutline'
              ? theme.danger
              : variant === 'successSoft'
                ? theme.success
                : theme.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style as ViewStyle,
      ]}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={foreground} size="small" />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={foreground} /> : null}
            <ThemedText type={size === 'sm' ? 'callout' : 'bodyStrong'} style={{ color: foreground }}>
              {label}
            </ThemedText>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
