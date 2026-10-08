/**
 * What the broadcast will actually look like on a donor's lock screen.
 *
 * The composer's two text fields are the only part of a push a sender controls,
 * and they are read in a context nothing else in this console resembles: a
 * narrow card, over a wallpaper, two lines deep, next to whatever else arrived
 * that hour. A character counter says a title is 71 characters; this says it is
 * cut off. That is the difference the preview exists for.
 *
 * It renders the *typed* copy, and falls back to the field placeholders while
 * both are empty — marked "Example text" by the card header, so a sender never
 * mistakes the sample for their own words.
 *
 * Web-only, like the rest of src/components/admin.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DropMark } from '@/components/admin/marks';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The lock screen is a phone, and a phone is dark-chrome-on-wallpaper in both
 * themes. These are fixed rather than theme-mapped for the same reason
 * `Button`'s `inverse` variant is: the surface being drawn does not belong to
 * the console, so it must not flip with the console's theme.
 */
const SCREEN = {
  bezel: '#151A36',
  from: Colors.light.brand,
  to: '#6E1118',
  text: '#FFFFFF',
  dim: 'rgba(255,255,255,0.78)',
  /** The notification card itself: iOS renders it near-white and translucent. */
  card: 'rgba(255,255,255,0.94)',
};

export function LockScreenPreview({
  title,
  body,
  /** Shown while the sender has typed nothing, so the sample is legible as one. */
  exampleTitle,
  exampleBody,
}: {
  title: string;
  body: string;
  exampleTitle: string;
  exampleBody: string;
}) {
  const theme = useTheme();

  // Captured once: a clock that re-rendered on every keystroke would draw the
  // eye away from the copy, which is the thing being previewed.
  const [now] = useState(() => new Date());

  const typed = !!title.trim() || !!body.trim();
  const shownTitle = title.trim() || exampleTitle;
  const shownBody = body.trim() || exampleBody;

  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessibilityRole="summary">
      <View style={styles.header}>
        <ThemedText type="headline">Lock screen preview</ThemedText>
        {typed ? null : (
          <View style={[styles.examplePill, { backgroundColor: theme.surfaceSunken }]}>
            <ThemedText type="caption" color="textSecondary">
              Example text
            </ThemedText>
          </View>
        )}
      </View>

      <View style={[styles.phone, { borderColor: SCREEN.bezel }]}>
        <Svg style={StyleSheet.absoluteFill as never} width="100%" height="100%">
          <Defs>
            <LinearGradient id="lock-wash" x1="0" y1="0" x2="0.4" y2="1">
              <Stop offset="0" stopColor={SCREEN.from} />
              <Stop offset="1" stopColor={SCREEN.to} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#lock-wash)" />
        </Svg>

        <View style={styles.clock}>
          <ThemedText type="footnote" style={{ color: SCREEN.dim }}>
            {now.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </ThemedText>
          <ThemedText style={[styles.time, { color: SCREEN.text }]}>
            {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </ThemedText>
        </View>

        <View style={[styles.notification, { backgroundColor: SCREEN.card }]}>
          <View style={styles.notificationHead}>
            <DropMark size={16} from={Colors.light.brand} to={Colors.light.brandStrong} />
            <ThemedText type="caption" style={styles.appName}>
              DONORNET
            </ThemedText>
            <ThemedText type="caption" style={styles.timestamp}>
              now
            </ThemedText>
          </View>
          {/* Two lines for the title and three for the body is what iOS shows
              before a notification is expanded — so this clips where the real
              one clips. */}
          <ThemedText type="footnote" style={styles.notificationTitle} numberOfLines={2}>
            {shownTitle}
          </ThemedText>
          <ThemedText type="footnote" style={styles.notificationBody} numberOfLines={3}>
            {shownBody}
          </ThemedText>
        </View>

        {/* A second card peeking out: it places the notification in a stack
            rather than alone on an empty screen. Decorative, so it is hidden
            from assistive tech along with the wallpaper and clock. */}
        <View
          style={[styles.stackHint, { backgroundColor: 'rgba(255,255,255,0.34)' }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      <View style={styles.caption}>
        <Ionicons name="information-circle-outline" size={14} color={theme.textTertiary} />
        <ThemedText type="footnote" color="textTertiary" style={styles.captionText}>
          Your title and message replace the example as you type. Longer titles are cut off here,
          exactly as they are on the phone.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.base,
    boxShadow: '0 1px 2px rgba(22, 25, 45, 0.04)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  examplePill: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },

  phone: {
    height: 380,
    borderWidth: 8,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    padding: Spacing.md,
    gap: Spacing.base,
  },
  clock: { alignItems: 'center', paddingTop: Spacing.lg, gap: 2 },
  time: { fontSize: 54, lineHeight: 62, fontWeight: '700', letterSpacing: -1.5 },

  notification: { borderRadius: Radius.lg, padding: Spacing.md, gap: 2 },
  notificationHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  appName: { flex: 1, color: Colors.light.text, letterSpacing: 0.6 },
  timestamp: { color: Colors.light.textTertiary, letterSpacing: 0 },
  notificationTitle: { color: Colors.light.text, fontWeight: '700' },
  notificationBody: { color: Colors.light.textSecondary, fontWeight: '400' },

  stackHint: { height: 10, marginHorizontal: Spacing.base, marginTop: -Spacing.md + 2, borderRadius: Radius.sm },

  caption: { flexDirection: 'row', gap: Spacing.sm },
  captionText: { flex: 1, minWidth: 0 },
});
