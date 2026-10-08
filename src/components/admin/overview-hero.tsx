/**
 * The console's welcome banner.
 *
 * It exists because the overview opened on a row of numbers with no orientation
 * — an operator arriving at 7am could not tell at a glance whether they were
 * looking at today. The banner answers the two cheap questions first (who is
 * this, what day is it) so the tiles below can be read as "today's" without
 * saying so four times.
 *
 * The greeting is a welcome rather than a time of day. An operations console is
 * staffed around the clock, so "Good morning" is wrong for whoever has the
 * night shift, and a greeting that changes under them is a detail that earns
 * nothing. The date chip carries the orientation instead, which is the part an
 * operator actually reads.
 *
 * Deliberately not a `Card`: `Card` owns a white fill and a shadow, and this is
 * a flat tinted wash. Composing it would mean overriding both.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { DropMark, HeartMark } from '@/components/admin/marks';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Below this the illustration is dropped rather than squeezed. */
const ART_BREAKPOINT = 1180;

export type OverviewHeroProps = {
  title: string;
  subtitle: string;
  /** Rendered as given; the caller owns whether this is a name or a role. */
  now?: Date;
};

export function OverviewHero({ title, subtitle, now = new Date() }: OverviewHeroProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const showArt = width >= ART_BREAKPOINT;

  const date = now.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="hero-wash" x1="0" y1="0" x2="1" y2="0.6">
              <Stop offset="0" stopColor={theme.heroFrom} />
              <Stop offset="0.52" stopColor={theme.heroVia} />
              <Stop offset="1" stopColor={theme.heroTo} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero-wash)" />
          {/* One soft bloom behind the greeting, so the wash has somewhere to
              come from. A second one on the right drew a visible arc against
              the white end of the gradient — the edge of an ellipse reads as a
              shape, not as light. */}
          <Ellipse cx="2%" cy="4%" rx="190" ry="110" fill={theme.brandSubtle} opacity={0.5} />
        </Svg>
      </View>

      <View style={styles.row}>
        <View style={styles.copy}>
          <ThemedText type="caption" color="textTertiary" style={styles.eyebrow}>
            WELCOME BACK,
          </ThemedText>

          <View style={styles.titleRow}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            <Ionicons name="sunny" size={24} color={theme.warning} />
          </View>

          <ThemedText type="body" color="textSecondary">
            {subtitle}
          </ThemedText>

          <View style={styles.meta}>
            <View
              style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="calendar-outline" size={14} color={theme.textTertiary} />
              <ThemedText type="footnote" color="textSecondary">
                {date}
              </ThemedText>
            </View>
            <View style={styles.tagline}>
              <ThemedText type="footnote" color="textSecondary">
                Together, we save lives.
              </ThemedText>
              <HeartMark size={13} color={theme.brand} />
            </View>
          </View>
        </View>

        {showArt ? <HeroArt /> : null}
      </View>
    </View>
  );
}

/** The drop, its heart, and the ribbon of script beside it. */
function HeroArt() {
  const theme = useTheme();

  return (
    <View
      style={styles.art}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.drop}>
        <DropMark size={116} from={theme.brand} to={theme.brandStrong} />
        <View style={styles.dropHeart}>
          <HeartMark size={34} color={theme.onBrand} />
        </View>
      </View>

      <View style={styles.script}>
        <ThemedText style={[styles.scriptLine, { color: theme.text }]}>Give Blood</ThemedText>
        <ThemedText style={[styles.scriptLine, { color: theme.text }]}>Save Lives</ThemedText>
        <Svg width={140} height={54} style={styles.flourish}>
          {/* A single looping stroke, the way a signature underlines itself. */}
          <Path
            d="M6 30 C30 6, 70 6, 86 24 C96 36, 84 50, 72 44 C60 38, 70 20, 96 18 C118 16, 132 26, 136 38"
            stroke={theme.brand}
            strokeOpacity={0.45}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.xl,
  },
  copy: { flex: 1, minWidth: 0, gap: Spacing.xs },
  eyebrow: { letterSpacing: 1.2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  title: { fontSize: 40, lineHeight: 48, fontWeight: '700', letterSpacing: -1.1 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.base,
    marginTop: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  art: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, paddingRight: Spacing.lg },
  drop: { alignItems: 'center', justifyContent: 'center' },
  dropHeart: { position: 'absolute', top: 54 },
  script: { alignItems: 'flex-start' },
  scriptLine: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '600',
    fontStyle: 'italic',
    letterSpacing: -0.2,
  },
  flourish: { marginTop: -8, marginLeft: -6 },
});
