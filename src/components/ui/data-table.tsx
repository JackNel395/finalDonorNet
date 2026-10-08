/**
 * Admin data table — a layout and state container, not a new visual language.
 * It composes `Card`, `ThemedText`, `Skeleton`, and `EmptyState`, and draws its
 * structure the way `profile.tsx`'s `Section` already does: `Card padding={0}`
 * with `StyleSheet.hairlineWidth` dividers.
 *
 * It owns loading, empty, error, and ready internally. That is the point: it is
 * the only way the console's six lists satisfy the four-state rule in
 * design-system/PATTERNS.md without six copies of the same state branch.
 *
 * Tuned for a pointer, because the console is web-only. Rows highlight on hover
 * rather than scaling on press: `PressableScale` is the right feedback for a
 * thumb on a card, but a 48px table row that shrinks under the cursor reads as
 * a glitch, and hover is the affordance a desktop user actually looks for to
 * know a row is clickable.
 *
 * Columns size by flex with a minimum width, so a wide monitor spends its space
 * on the data instead of on trailing dead margin. Below the row's total minimum
 * the table scrolls horizontally inside its card, so the page itself never
 * scrolls sideways.
 */
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Ready with no rows is the empty state, so it isn't a separate value — the
 * table derives it. Success is simply rows on screen.
 */
export type DataTableState = 'loading' | 'error' | 'ready';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  /** Minimum width; also this column's share of leftover space. */
  width?: number;
  /** Share of the surplus width. 0 pins the column to exactly `width`. */
  grow?: number;
  /** Right-align numeric columns so digits line up down the column. */
  align?: 'left' | 'right';
  /**
   * Counts and ratios. Right-aligns the cell and switches it to tabular
   * figures, so "2/2" and "11/12" share a decimal column instead of drifting
   * by a glyph width per row. `font-variant-numeric` inherits, so setting it
   * on the cell covers whatever the column renders inside it.
   */
  numeric?: boolean;
  render: (row: T) => ReactNode;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  state: DataTableState;
  onRowPress?: (row: T) => void;
  /** Standalone screen-reader label for a pressable row. */
  rowLabel?: (row: T) => string;
  emptyTitle: string;
  emptySubtitle?: string;
  /**
   * Replaces the default `EmptyState` when a screen's "nothing here" deserves
   * more than an icon and two lines — the overview's queue, for instance, where
   * an empty list is the good outcome and the useful next step is a link into
   * the full history. `emptyTitle` stays required: it is still the accessible
   * name for the branch, and a caller that drops the slot keeps a working one.
   */
  emptySlot?: ReactNode;
  /**
   * `outline` drops the fill and shadow so the table can sit *inside* another
   * card without stacking two white surfaces. Default stays standalone.
   */
  variant?: 'default' | 'outline';
  /** Specific inline explanation for the error branch. */
  errorTitle?: string;
  errorSubtitle?: string;
  onRetry?: () => void;
};

const DEFAULT_WIDTH = 160;
/** Minimum row height; also the click target for a pressable row. */
const ROW_HEIGHT = 48;
const SKELETON_ROWS = 8;

export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  state,
  onRowPress,
  rowLabel,
  emptyTitle,
  emptySubtitle,
  emptySlot,
  variant = 'default',
  errorTitle = 'Could not load this list',
  errorSubtitle = 'The console could not reach the server. Check your connection and try again.',
  onRetry,
}: DataTableProps<T>) {
  const theme = useTheme();
  const widths = columns.map((c) => c.width ?? DEFAULT_WIDTH);
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + Spacing.base * 2;

  const cellStyle = (i: number) => {
    const col = columns[i];
    const right = col.numeric || col.align === 'right';
    return {
      minWidth: widths[i],
      flexGrow: col.grow ?? 1,
      flexShrink: 0,
      flexBasis: widths[i],
      // `stretch`, not `flex-start`: a cell that sizes itself to its content
      // lets a long name ignore the column width and run into its neighbour
      // instead of truncating. Right-aligned cells still pack to their end.
      alignItems: right ? ('flex-end' as const) : ('stretch' as const),
      ...(col.numeric ? { fontVariant: ['tabular-nums' as const] } : null),
    };
  };

  if (state === 'error') {
    return (
      <Card padding={0} variant={variant}>
        <EmptyState
          icon="cloud-offline-outline"
          title={errorTitle}
          subtitle={errorSubtitle}
          actionLabel={onRetry ? 'Try again' : undefined}
          onAction={onRetry}
        />
      </Card>
    );
  }

  if (state === 'ready' && rows.length === 0) {
    return (
      <Card padding={0} variant={variant}>
        {emptySlot ?? (
          <EmptyState icon="file-tray-outline" title={emptyTitle} subtitle={emptySubtitle} />
        )}
      </Card>
    );
  }

  return (
    <Card padding={0} variant={variant}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.hScroll}>
        {/* `list` rather than `grid`: RN's AccessibilityRole has no table role,
            and a list of rows is the honest description of what a reader walks. */}
        <View style={[styles.table, { minWidth: totalWidth }]} accessibilityRole="list">
          {/* No fill behind the header: a tinted band competes with the row
              stripes below it for the eye, and the hairline already separates
              the labels from the data. */}
          <View style={[styles.row, styles.headerRow, { borderColor: theme.border }]}>
            {columns.map((col, i) => (
              <View key={col.key} style={cellStyle(i)}>
                <ThemedText type="footnote" color="textTertiary" numberOfLines={1}>
                  {col.header}
                </ThemedText>
              </View>
            ))}
          </View>

          {state === 'loading'
            ? Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <View
                  // Shaped like the eventual rows, not a full-screen spinner.
                  key={`skeleton-${i}`}
                  style={[
                    styles.row,
                    styles.bodyRow,
                    { borderColor: theme.border },
                    i === SKELETON_ROWS - 1 && styles.lastRow,
                  ]}>
                  {columns.map((col, c) => (
                    <View key={col.key} style={cellStyle(c)}>
                      <Skeleton width={Math.min(widths[c] - Spacing.base, 110)} height={12} />
                    </View>
                  ))}
                </View>
              ))
            : rows.map((row, i) => {
                const last = i === rows.length - 1;
                const cells = columns.map((col, c) => (
                  <View key={col.key} style={cellStyle(c)}>
                    {col.render(row)}
                  </View>
                ));

                if (!onRowPress) {
                  return (
                    <View
                      key={keyExtractor(row)}
                      style={[
                        styles.row,
                        styles.bodyRow,
                        { borderColor: theme.border },
                        last && styles.lastRow,
                      ]}>
                      {cells}
                    </View>
                  );
                }

                return (
                  <Pressable
                    key={keyExtractor(row)}
                    onPress={() => onRowPress(row)}
                    accessibilityRole="button"
                    accessibilityLabel={rowLabel?.(row)}
                    style={({ hovered, pressed }) => [
                      styles.row,
                      styles.bodyRow,
                      { borderColor: theme.border },
                      last && styles.lastRow,
                      hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
                    ]}>
                    {cells}
                  </Pressable>
                );
              })}
        </View>
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  // `flexGrow` on the content container lets the table fill the card when the
  // viewport is wider than the columns' combined minimum.
  hScroll: { flexGrow: 1 },
  table: { flex: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    paddingHorizontal: Spacing.base,
  },
  headerRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Rows grow for enlarged text rather than clipping; ROW_HEIGHT is the floor
  // and the click target.
  bodyRow: {
    minHeight: ROW_HEIGHT,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // No hairline against the card's own bottom edge.
  lastRow: { borderBottomWidth: 0 },
});
