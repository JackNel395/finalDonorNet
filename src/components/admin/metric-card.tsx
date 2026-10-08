/**
 * One overview tile: a count, what it counts, how it moved, and a line behind
 * the movement.
 *
 * Local to the console rather than folded into `ui/StatTile`. `StatTile` is the
 * donor app's compact metric — icon, number, label — and it is used on phone
 * screens where a trend line and a drill-in chevron would be noise. Widening it
 * with `trend`, `delta`, `onPress`, and a sparkline would hand every donor
 * screen four props it will never pass, which is exactly the API growth
 * design-system/COMPONENTS.md warns against. Two small components, each honest
 * about its surface.
 *
 * The change row never shows a percentage the data cannot support: with no
 * baseline to compare against, it says so in words instead of printing a
 * misleading "0%". Direction is carried by an arrow and by the words, never by
 * green-versus-red alone.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sparkline } from '@/components/admin/sparkline';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AdminTrend } from '@/types/api';

export type MetricTint = 'brand' | 'info' | 'success' | 'accent' | 'warning' | 'neutral';

const TINTS: Record<MetricTint, { fg: ThemeColor; bg: ThemeColor }> = {
  brand: { fg: 'brand', bg: 'brandSubtle' },
  info: { fg: 'info', bg: 'infoSubtle' },
  success: { fg: 'success', bg: 'successSubtle' },
  accent: { fg: 'accent', bg: 'accentSubtle' },
  warning: { fg: 'warning', bg: 'warningSubtle' },
  neutral: { fg: 'textSecondary', bg: 'surfaceSunken' },
};

export type MetricCardProps = {
  label: string;
  /** Already formatted — an em dash when the count could not be fetched. */
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: MetricTint;
  /** What the two comparison windows are, in the operator's words. */
  period: string;
  trend?: AdminTrend;
  onPress?: () => void;
  /** Standalone description of where `onPress` goes. */
  openLabel: string;
};

/**
 * A percentage needs a non-zero baseline. Everything else is stated in words,
 * because "+100%" from one to two reads as a surge and is not one.
 */
function describe(trend: AdminTrend | undefined, period: string) {
  if (!trend) return { text: `Change over ${period} unavailable`, dir: 'flat' as const, pct: null };

  const { current, previous } = trend;
  if (current === previous) return { text: `No change from ${period}`, dir: 'flat' as const, pct: null };
  if (previous === 0) {
    const n = current - previous;
    return { text: `${n} more than ${period}`, dir: 'up' as const, pct: null };
  }

  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    text: `vs. ${period}`,
    dir: current > previous ? ('up' as const) : ('down' as const),
    pct: Math.abs(pct),
  };
}

export function MetricCard({
  label,
  value,
  icon,
  tint,
  period,
  trend,
  onPress,
  openLabel,
}: MetricCardProps) {
  const theme = useTheme();
  const tokens = TINTS[tint];
  const change = describe(trend, period);

  // Rising donors are good and rising critical requests are not, so the pill
  // takes the tile's own tint rather than asserting a universal good/bad.
  const pillFg = theme[tokens.fg];
  const pillBg = theme[tokens.bg];

  return (
    <Card style={styles.card} padding="base" radius="lg">
      <View style={styles.head}>
        <View style={[styles.iconWrap, { backgroundColor: theme[tokens.bg] }]}>
          <Ionicons name={icon} size={20} color={theme[tokens.fg]} />
        </View>
        {onPress ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="link"
            accessibilityLabel={openLabel}
            // 44pt target around a 28pt visual, per PATTERNS.md.
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ hovered, pressed }) => [
              styles.open,
              { backgroundColor: theme[tokens.bg], opacity: hovered || pressed ? 1 : 0.75 },
            ]}>
            <Ionicons name="chevron-forward" size={14} color={theme[tokens.fg]} />
          </Pressable>
        ) : null}
      </View>

      <ThemedText style={styles.value}>{value}</ThemedText>
      <ThemedText type="footnote" color="textSecondary" numberOfLines={2} style={styles.label}>
        {label}
      </ThemedText>

      <View style={styles.change}>
        {change.pct != null ? (
          <View style={[styles.pill, { backgroundColor: pillBg }]}>
            <Ionicons
              name={change.dir === 'up' ? 'arrow-up' : 'arrow-down'}
              size={11}
              color={pillFg}
            />
            <ThemedText type="caption" style={{ color: pillFg }}>
              {change.pct}%
            </ThemedText>
          </View>
        ) : (
          <Ionicons name="remove-outline" size={14} color={theme.textTertiary} />
        )}
        <ThemedText type="caption" color="textTertiary" numberOfLines={2} style={styles.changeText}>
          {change.text}
        </ThemedText>
        <View style={styles.spark}>
          <Sparkline points={trend?.series ?? []} color={theme[tokens.fg]} width={100} height={26} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 2, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  open: {
    width: 26,
    height: 26,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: Spacing.md,
  },
  // Reserves two lines so values stay baseline-aligned across the tile row even
  // when one label wraps and its neighbours don't.
  label: { minHeight: 20 },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    minHeight: 26,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  changeText: { flex: 1, minWidth: 0 },
  // The line is decoration; the words beside it are the fact, so it gives up
  // width first when the tile is narrow.
  spark: { flexShrink: 1 },
});
