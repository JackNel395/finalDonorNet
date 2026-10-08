/**
 * Illustrated empty states for the request detail panels.
 *
 * `EmptyState` draws one Ionicon in a grey circle, which is the right weight
 * for a table that is empty because a filter excluded everything. These two
 * panels are different: an unanswered request and an unmoderated one are the
 * *normal* opening state of every request, seen on every detail page, and a
 * grey glyph repeated twice down the page reads as two errors rather than as
 * "nothing has happened yet".
 *
 * Drawn rather than imported as assets so they take theme colors at render time
 * and stay crisp at any size, the same reasoning as `marks.tsx`.
 *
 * Both are decorative: the panel states the situation in words beneath them, so
 * they are hidden from assistive technology rather than given a label that
 * would be read twice.
 *
 * Web-only, like every module in this directory.
 */
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * Two donors and the drop nobody has offered yet. The figures are drawn in the
 * page's own line color rather than grey, so the art sits in the surface
 * instead of on top of it.
 */
export function NoRespondersArt({ size = 132 }: { size?: number }) {
  const theme = useTheme();

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size * 0.62} viewBox="0 0 132 82">
        {/* Ground shadow, so the figures stand rather than float. */}
        <Ellipse cx="66" cy="74" rx="38" ry="6" fill={theme.border} opacity={0.75} />

        {/* Back figure, lower contrast — a crowd of two reads as a group. */}
        <Circle cx="50" cy="34" r="11" fill={theme.border} />
        <Path
          d="M32 70c0-9.9 8.1-18 18-18s18 8.1 18 18z"
          fill={theme.border}
        />

        {/* Front figure. */}
        <Circle cx="76" cy="38" r="12.5" fill={theme.borderStrong} opacity={0.6} />
        <Path
          d="M56 70c0-11 9-20 20-20s20 9 20 20z"
          fill={theme.borderStrong}
          opacity={0.6}
        />

        {/* The two marks that say what the crowd is for: a heart offered, and a
            drop still waiting. */}
        <Path
          d="M30 16c-.1 0-3.4-2.1-4.2-4.1-.7-1.6.3-3.3 1.9-3.3.9 0 1.8.5 2.3 1.3.5-.8 1.4-1.3 2.3-1.3 1.6 0 2.6 1.7 1.9 3.3C33.4 13.9 30.1 16 30 16Z"
          fill={theme.brand}
          opacity={0.55}
        />
        <Path
          d="M104 8c0 0-7 8.1-7 11.7 0 3.8 3.1 5.9 7 5.9s7-2.1 7-5.9C111 16.1 104 8 104 8Z"
          fill={theme.brand}
        />
      </Svg>
    </View>
  );
}

/** A clean shield: nothing has been done to this request, and that is fine. */
export function NoAuditArt({ size = 56 }: { size?: number }) {
  const theme = useTheme();

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx="24" cy="24" r="23" fill="none" stroke={theme.border} strokeWidth={1.5} />
        <Path
          d="M24 13l8 3v7c0 5.1-3.4 9.6-8 11-4.6-1.4-8-5.9-8-11v-7l8-3Z"
          fill="none"
          stroke={theme.textTertiary}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <Path
          d="M20.5 24.5l2.5 2.5 4.5-5"
          fill="none"
          stroke={theme.textTertiary}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
