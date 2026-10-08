import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type StatTileProps = {
  label: string;
  value: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: 'brand' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  /**
   * `filled` floods the tile with its tint and colors the number to match, so a
   * row of counts reads as a row of states at a glance. For a summary strip
   * above the thing it summarizes, where each tile is a different status and
   * the contrast between them is the information. `card` stays the default: on
   * a dashboard of mixed metrics, four saturated panels compete with the
   * content rather than introducing it.
   */
  variant?: 'card' | 'filled';
};

const TINTS = {
  brand: { fg: 'brand', bg: 'brandSubtle' },
  success: { fg: 'success', bg: 'successSubtle' },
  info: { fg: 'info', bg: 'infoSubtle' },
  warning: { fg: 'warning', bg: 'warningSubtle' },
  danger: { fg: 'danger', bg: 'dangerSubtle' },
  neutral: { fg: 'textSecondary', bg: 'surfaceSunken' },
} as const;

export function StatTile({
  label,
  value,
  icon,
  tint = 'neutral',
  variant = 'card',
}: StatTileProps) {
  const theme = useTheme();
  const tokens = TINTS[tint];

  if (variant === 'filled') {
    return (
      <View
        style={[
          styles.filled,
          { backgroundColor: theme[tokens.bg], borderColor: theme[tokens.bg] },
        ]}
        accessibilityRole="summary"
        accessibilityLabel={`${value} ${label}`}>
        <ThemedText type="title" style={{ color: theme[tokens.fg] }}>
          {value}
        </ThemedText>
        {/* The label is tinted too, but never carries the meaning alone — it
            states the status in words beside the count. */}
        <ThemedText type="subhead" style={{ color: theme[tokens.fg] }} numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
    );
  }

  return (
    <Card style={styles.card} padding="base">
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: theme[tokens.bg] }]}>
          <Ionicons name={icon} size={18} color={theme[tokens.fg]} />
        </View>
      ) : null}
      <ThemedText type="title2" style={styles.value}>
        {value}
      </ThemedText>
      <ThemedText type="footnote" color="textSecondary" numberOfLines={2} style={styles.label}>
        {label}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: Spacing.xs },
  filled: {
    flex: 1,
    minWidth: 160,
    gap: Spacing.xs,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  value: { marginTop: 'auto' },
  // Reserve two label lines so values stay baseline-aligned across a tile row
  // even when one label wraps ("Lives helped") and its neighbors don't.
  label: { minHeight: 36 },
});
