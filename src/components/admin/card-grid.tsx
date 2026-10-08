/**
 * The console's responsive card grid, shared by the donor and article lists.
 *
 * This is CSS Grid rather than the wrapping flex row it replaced, and the
 * reason is the last row. With `flexWrap` + `flexGrow`, a row that is not full
 * stretches its items to fill the width — so four cards in a three-column
 * layout render as three normal cards and one that spans the entire row. Grid
 * tracks are sized from the container, not from how many items landed in the
 * row, so a lone trailing card stays exactly one column wide.
 *
 * `auto-fill` (not `auto-fit`) is what preserves those empty tracks:
 * `auto-fit` collapses them and reintroduces the stretch.
 *
 * Web-only, like everything in this directory, which is what makes reaching for
 * a CSS display mode legitimate here — react-native-web passes it through, and
 * the native bundle never resolves this module.
 */
import { View, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';

/**
 * Minimum track width. 400 yields three columns inside the shell's 1560px
 * content column, two at tablet widths, and one on a narrow window — matching
 * how the rest of the console reflows without a second breakpoint table.
 */
const MIN_COLUMN = 400;

// React Native's ViewStyle has no grid members; react-native-web forwards them
// verbatim. Cast once, here, rather than at each call site.
const GRID: ViewStyle = {
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_COLUMN}px, 1fr))`,
  gap: Spacing.base,
} as unknown as ViewStyle;

export function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <View style={GRID} accessibilityRole="list">
      {children}
    </View>
  );
}
