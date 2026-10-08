/**
 * The 8x8 ABO/Rh compatibility matrix, rendered from `canDonateTo` so it can
 * never drift from the matching logic that powers the feed and push targeting.
 *
 * Two directions, because the two questions are transposes of each other and
 * confusing them is the classic bug in this domain:
 *   - `donate`  — rows are the donor, columns the patient they can supply.
 *   - `receive` — rows are the patient, columns the donors they can accept.
 *
 * Reference material, not an eligibility verdict. Final compatibility is
 * confirmed by cross-matching at the donation center.
 */

import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { canDonateTo, donorsFor, recipientsFor, spokenBloodType } from '@/lib/blood';
import { BLOOD_TYPES, type BloodType } from '@/types/domain';

export type CompatibilityDirection = 'donate' | 'receive';

export type BloodCompatibilityTableProps = {
  /** Which question the table answers. Defaults to the donor's question. */
  direction?: CompatibilityDirection;
  /** The viewer's blood type; its row is tinted and labelled as theirs. */
  highlight?: BloodType;
  style?: StyleProp<ViewStyle>;
};

/** Fixed geometry so the pinned type column and the scrolling grid stay aligned. */
const CELL = 38;
const ROW_LABEL_WIDTH = 54;
const ROW_HEIGHT = 38;
const HEAD_HEIGHT = 34;

export function BloodCompatibilityTable({
  direction = 'donate',
  highlight,
  style,
}: BloodCompatibilityTableProps) {
  const theme = useTheme();

  /** Rows are always "if you are type X"; direction decides what a filled cell means. */
  const isMatch = (row: BloodType, column: BloodType) =>
    direction === 'donate' ? canDonateTo(row, column) : canDonateTo(column, row);

  const matchesFor = (row: BloodType) =>
    direction === 'donate' ? recipientsFor(row) : donorsFor(row);

  const rowLabel = (row: BloodType) => {
    const matches = matchesFor(row).map(spokenBloodType).join(', ');
    const verb = direction === 'donate' ? 'can donate to' : 'can receive from';
    const mine = row === highlight ? 'Your type. ' : '';
    return `${mine}Type ${spokenBloodType(row)} ${verb}: ${matches}.`;
  };

  return (
    <View style={[styles.table, { borderColor: theme.border }, style]}>
      {/* Pinned type column. Carries the accessible label for its whole row, so
          a screen reader reads one sentence instead of eight silent cells. */}
      <View>
        <View style={[styles.corner, { backgroundColor: theme.surfaceSunken }]}>
          <ThemedText type="caption" color="textTertiary">
            TYPE
          </ThemedText>
        </View>
        {BLOOD_TYPES.map((row) => {
          const mine = row === highlight;
          return (
            <View
              key={row}
              accessible
              accessibilityRole="text"
              accessibilityLabel={rowLabel(row)}
              style={[
                styles.rowLabel,
                {
                  backgroundColor: mine ? theme.brandSubtle : theme.surface,
                  borderTopColor: theme.border,
                },
              ]}>
              <ThemedText type="subhead" color={mine ? 'brand' : 'text'} style={styles.rowLabelText}>
                {row}
              </ThemedText>
            </View>
          );
        })}
      </View>

      {/* Scrolling grid. Hidden from assistive tech — the pinned column says it all. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        contentContainerStyle={styles.gridContent}>
        <View>
          <View style={[styles.headRow, { backgroundColor: theme.surfaceSunken }]}>
            {BLOOD_TYPES.map((column) => (
              <View key={column} style={styles.headCell}>
                <ThemedText type="caption" color="textTertiary">
                  {column}
                </ThemedText>
              </View>
            ))}
          </View>
          {BLOOD_TYPES.map((row) => {
            const mine = row === highlight;
            return (
              <View
                key={row}
                style={[
                  styles.row,
                  {
                    backgroundColor: mine ? theme.brandSubtle : theme.surface,
                    borderTopColor: theme.border,
                  },
                ]}>
                {BLOOD_TYPES.map((column) => (
                  <View key={column} style={styles.cell}>
                    {isMatch(row, column) ? (
                      <Ionicons name="water" size={17} color={theme.brand} />
                    ) : (
                      <View style={[styles.blank, { backgroundColor: theme.borderStrong }]} />
                    )}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  corner: {
    width: ROW_LABEL_WIDTH,
    height: HEAD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    width: ROW_LABEL_WIDTH,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabelText: { fontWeight: '700' },
  gridContent: { flexGrow: 1 },
  headRow: { flexDirection: 'row', height: HEAD_HEIGHT },
  headCell: { width: CELL, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', height: ROW_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth },
  cell: { width: CELL, alignItems: 'center', justifyContent: 'center' },
  blank: { width: 5, height: 5, borderRadius: Radius.full, opacity: 0.5 },
});
