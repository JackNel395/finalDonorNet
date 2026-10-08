/**
 * Screen title, one line of context, and the screen's primary actions.
 *
 * In the content column rather than in the shell's top bar: the console's
 * global bar is the same on every screen, and a list whose heading scrolls with
 * its own panel reads as one object instead of as chrome plus a detached table.
 * Screens that use it pass `showTitle={false}` to `AdminShell` so the name is
 * not printed twice.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ReactNode } from 'react';

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  /** The screen's primary action, and any control that qualifies it. */
  actions?: ReactNode;
}) {
  return (
    <View style={styles.heading}>
      <View style={styles.headingText}>
        <ThemedText style={styles.headingTitle}>{title}</ThemedText>
        <ThemedText type="body" color="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

/**
 * Where a detail screen sits, and the way back out of it.
 *
 * A detail route is reached from a list, and the operator's next move is almost
 * always back to that list — so the trail names it rather than leaving a bare
 * chevron to guess at. The back button and the list crumb do the same thing on
 * purpose: one is the habit, the other is the label.
 *
 * The last crumb is the current page and is not pressable; it is the heading
 * the shell is no longer printing.
 */
export function Breadcrumb({
  trail,
  onBack,
}: {
  /** Oldest first. Only the last one may omit `onPress`. */
  trail: { label: string; onPress?: () => void }[];
  onBack: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.crumbs}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ hovered, pressed }) => [
          styles.back,
          { backgroundColor: theme.surface, borderColor: theme.border },
          hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
        ]}>
        <Ionicons name="chevron-back" size={18} color={theme.text} />
      </Pressable>

      {trail.map((crumb, i) => {
        const last = i === trail.length - 1;
        return (
          <View key={`${crumb.label}-${i}`} style={styles.crumb}>
            {i > 0 ? (
              <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
            ) : null}
            {crumb.onPress && !last ? (
              <Pressable
                onPress={crumb.onPress}
                accessibilityRole="link"
                accessibilityLabel={`Back to ${crumb.label}`}
                style={({ hovered }) => [styles.crumbLink, hovered ? styles.crumbHover : null]}>
                <ThemedText type="subhead" color="textSecondary">
                  {crumb.label}
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="subhead" numberOfLines={1} style={styles.crumbCurrent}>
                {crumb.label}
              </ThemedText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.base,
    // react-native-web gives every View `z-index: 0`, so each is its own
    // stacking context and a child's z-index only competes with its siblings.
    // The date picker's calendar opens downward out of this row, over the
    // panel that follows it — so the row itself has to outrank that panel, or
    // the panel paints over the calendar on document order alone.
    zIndex: 30,
  },
  headingText: { flex: 1, minWidth: 260, gap: 2 },
  headingTitle: { fontSize: 34, lineHeight: 42, fontWeight: '700', letterSpacing: -0.9 },
  // The actions sit on one line and keep their own order; `overflow: visible`
  // so a date picker opening below its chip is not clipped by this row.
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, overflow: 'visible' },

  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm },
  back: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minWidth: 0 },
  crumbLink: { minHeight: 32, justifyContent: 'center' },
  crumbHover: { opacity: 0.7 },
  crumbCurrent: { fontWeight: '600', minWidth: 0 },
});
