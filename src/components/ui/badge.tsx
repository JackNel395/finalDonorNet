import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Urgency } from '@/types/domain';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  /**
   * A glyph before the label, tinted with the tone. For a status whose colour
   * would otherwise be the only thing separating it from its neighbour — the
   * second signal the accessibility rule asks for, where a bare dot only
   * repeats the colour.
   */
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * False where the badge sits in running display type rather than in a dense
   * table. Caps are what make a status findable down a column of rows; beside
   * a 34pt headline they read as shouting, and the label is already the
   * largest thing in its own corner.
   */
  uppercase?: boolean;
  style?: ViewStyle;
};

export function Badge({
  label,
  tone = 'neutral',
  dot,
  icon,
  uppercase = true,
  style,
}: BadgeProps) {
  const theme = useTheme();

  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.surfaceSunken, fg: theme.textSecondary },
    brand: { bg: theme.brandSubtle, fg: theme.brand },
    success: { bg: theme.successSubtle, fg: theme.success },
    warning: { bg: theme.warningSubtle, fg: theme.warning },
    danger: { bg: theme.dangerSubtle, fg: theme.danger },
    info: { bg: theme.infoSubtle, fg: theme.info },
  };
  const { bg, fg } = map[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      {icon ? <Ionicons name={icon} size={13} color={fg} /> : null}
      <ThemedText
        type="caption"
        style={[uppercase ? styles.label : styles.labelPlain, { color: fg }]}>
        {label}
      </ThemedText>
    </View>
  );
}

export const URGENCY_TONE: Record<Urgency, BadgeTone> = {
  critical: 'danger',
  urgent: 'warning',
  moderate: 'info',
  routine: 'neutral',
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  critical: 'Critical',
  urgent: 'Urgent',
  moderate: 'Moderate',
  routine: 'Routine',
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { textTransform: 'uppercase' },
  labelPlain: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
});
