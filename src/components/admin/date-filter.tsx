/**
 * The appointments day filter: a chip naming the day in view, with a month
 * calendar behind it.
 *
 * A `Select` cannot do this job. The useful question at a blood centre is "what
 * is booked on the 14th", which is an open set of values, not a list of four —
 * and the answer staff want is phrased as a date, so the control has to show
 * one. The chip states the current day in full ("Oct 2, 2026") rather than
 * "Date: set", for the same reason `Select`'s trigger names its value.
 *
 * The grid is drawn here rather than delegated to `<input type="date">`: that
 * control is unstyleable across browsers, and react-native-web's `TextInput`
 * cannot emit one anyway.
 *
 * Days are handled as local calendar days and converted to an ISO instant only
 * at the filter boundary, so "Oct 2" means the operator's Oct 2 — a booking at
 * 9am local never lands on the previous day because the server reads UTC.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RequiredMark } from '@/components/ui/input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const CONTROL_HEIGHT = 40;
/** The `field` variant matches `Input` and `Select variant="field"`. */
const FIELD_HEIGHT = 52;
/** Matches `Pager`'s number buttons — the console's established dense target. */
const CELL = 36;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A calendar day, free of any time zone: 'YYYY-MM-DD'. */
export type DayKey = string;

export function todayKey(now = new Date()): DayKey {
  return toDayKey(now);
}

export function toDayKey(d: Date): DayKey {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The day's first instant, local — the `dateFrom` bound for that day. */
export function dayStartISO(key: DayKey): string {
  return fromDayKey(key).toISOString();
}

/** The day's last instant, local — the `dateTo` bound for that day. */
export function dayEndISO(key: DayKey): string {
  const d = fromDayKey(key);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function dayLabel(key: DayKey): string {
  return fromDayKey(key).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DateFilter({
  value,
  onChange,
  placeholder = 'Any date',
  clearable = true,
  variant = 'chip',
  label = 'Date',
  required,
  error,
}: {
  /** Null is "every day", the state the list opens in. */
  value: DayKey | null;
  onChange: (value: DayKey | null) => void;
  /** What the chip reads with nothing chosen. "Pick a day" inside a form. */
  placeholder?: string;
  /**
   * False where null is not a usable answer — a booking form, where the day is
   * required and "clear" would only ever undo the operator's own choice.
   */
  clearable?: boolean;
  /**
   * `chip` is the list filter. `field` is the same calendar inside a form: a
   * label above a full-width 52pt box, so it reads as a peer of the inputs
   * around it rather than as a filter that wandered into the form.
   */
  variant?: 'chip' | 'field';
  /** `field` only: the visible label, also the control's accessible name. */
  label?: string;
  required?: boolean;
  error?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(value ? fromDayKey(value) : new Date()));

  const shown = value ? dayLabel(value) : placeholder;
  const field = variant === 'field';
  // In a form the chosen day is an answer, not an active filter, so it is not
  // tinted — only an error or an open calendar changes the border.
  const tinted = !!value && !field;

  return (
    <View style={[styles.wrap, field ? styles.wrapField : null]}>
      {field ? (
        <ThemedText type="subhead" color="textSecondary" style={styles.fieldLabel}>
          {label}
          {required ? <RequiredMark /> : null}
        </ThemedText>
      ) : null}
      <View style={styles.anchor}>
        <Pressable
          onPress={() => {
            // Reopening after the operator has paged the calendar away should
            // start from the day they are actually filtered to.
            if (!open) setMonth(startOfMonth(value ? fromDayKey(value) : new Date()));
            setOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={field ? `${label}: ${shown}` : `Filter by date: ${shown}`}
          style={({ hovered, pressed }) => [
            styles.chip,
            field ? styles.fieldControl : null,
            {
              backgroundColor: field
                ? theme.surfaceSunken
                : tinted
                  ? theme.brandSubtle
                  : theme.surface,
              borderColor:
                field && error && !open
                  ? theme.danger
                  : open || tinted
                    ? theme.brand
                    : theme.border,
            },
            hovered || pressed ? { borderColor: tinted ? theme.brand : theme.borderStrong } : null,
          ]}>
          <Ionicons
            name="calendar-outline"
            size={field ? 18 : 16}
            color={tinted || open ? theme.brand : field ? theme.textTertiary : theme.textSecondary}
          />
          <ThemedText
            type={field ? 'body' : 'subhead'}
            style={[
              field ? styles.fieldValue : styles.chipLabel,
              {
                color: tinted ? theme.brand : value || !field ? theme.text : theme.textTertiary,
              },
            ]}
            numberOfLines={1}>
            {shown}
          </ThemedText>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={field ? 18 : 14}
            color={tinted ? theme.brand : theme.textTertiary}
          />
        </Pressable>

        {open ? (
          <>
            <Pressable
              style={styles.backdrop as ViewStyle}
              accessibilityLabel="Close calendar"
              onPress={() => setOpen(false)}
            />
            <View
              style={[
                styles.popover,
                field ? styles.popoverField : null,
                {
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                },
              ]}>
              <View style={styles.monthRow}>
                <MonthArrow
                  icon="chevron-back"
                  label="Previous month"
                  onPress={() => setMonth((m) => addMonths(m, -1))}
                />
                <ThemedText type="headline" style={styles.monthLabel}>
                  {month.toLocaleDateString(undefined, {
                    month: 'long',
                    year: 'numeric',
                  })}
                </ThemedText>
                <MonthArrow
                  icon="chevron-forward"
                  label="Next month"
                  onPress={() => setMonth((m) => addMonths(m, 1))}
                />
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((d, i) => (
                  <View key={`${d}-${i}`} style={styles.cell}>
                    <ThemedText type="caption" color="textTertiary">
                      {d}
                    </ThemedText>
                  </View>
                ))}
              </View>

              <View style={styles.grid}>
                {monthCells(month).map((cell, i) =>
                  cell === null ? (
                    <View key={`pad-${i}`} style={styles.cell} />
                  ) : (
                    <DayCell
                      key={cell}
                      day={cell}
                      selected={cell === value}
                      today={cell === todayKey()}
                      onPress={() => {
                        onChange(cell);
                        setOpen(false);
                      }}
                    />
                  ),
                )}
              </View>

              <View style={[styles.footer, { borderTopColor: theme.border }]}>
                <Pressable
                  onPress={() => {
                    onChange(todayKey());
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  style={({ hovered }) => [
                    styles.footerButton,
                    hovered ? { backgroundColor: theme.surfaceSunken } : null,
                  ]}>
                  <ThemedText type="footnote" style={{ color: theme.brand }}>
                    Today
                  </ThemedText>
                </Pressable>
                {/* Not rendered when nothing is set: a permanently dead "Clear"
                  is the same dishonesty as a disabled filter that never
                  applied. */}
                {value && clearable ? (
                  <Pressable
                    onPress={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    style={({ hovered }) => [
                      styles.footerButton,
                      hovered ? { backgroundColor: theme.surfaceSunken } : null,
                    ]}>
                    <ThemedText type="footnote" color="textSecondary">
                      Clear
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </>
        ) : null}
      </View>

      {field && error ? (
        <ThemedText type="footnote" color="danger" style={styles.fieldLabel}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

function DayCell({
  day,
  selected,
  today,
  onPress,
}: {
  day: DayKey;
  selected: boolean;
  today: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const date = fromDayKey(day);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={dayLabel(day)}
      style={({ hovered, pressed }) => [
        styles.cell,
        styles.dayCell,
        selected
          ? { backgroundColor: theme.brand }
          : hovered || pressed
            ? { backgroundColor: theme.surfaceSunken }
            : null,
      ]}>
      <ThemedText
        type="footnote"
        style={{
          color: selected ? theme.onBrand : theme.text,
          // Today is marked by weight, not by colour alone.
          fontWeight: selected || today ? '700' : '500',
        }}>
        {date.getDate()}
      </ThemedText>
    </Pressable>
  );
}

function MonthArrow({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered, pressed }) => [
        styles.monthArrow,
        hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
      ]}>
      <Ionicons name={icon} size={16} color={theme.text} />
    </Pressable>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Leading blanks for the first week, then every day of the month. */
function monthCells(month: Date): (DayKey | null)[] {
  const first = startOfMonth(month);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (DayKey | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let i = 1; i <= days; i++) {
    cells.push(toDayKey(new Date(month.getFullYear(), month.getMonth(), i)));
  }
  return cells;
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 30, overflow: 'visible' },
  wrapField: { gap: Spacing.sm },
  // The calendar hangs off the box itself, not off the label above it.
  anchor: { position: 'relative', overflow: 'visible' },
  fieldLabel: { marginLeft: Spacing.xs },
  fieldControl: { height: FIELD_HEIGHT, paddingHorizontal: Spacing.base },
  fieldValue: { flex: 1, minWidth: 0 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: CONTROL_HEIGHT,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  chipLabel: { fontWeight: '600' },

  // Web-only and intentional: the backdrop must cover the viewport, not the
  // chip's own box, so the next click anywhere closes the calendar.
  backdrop: { position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 },
  popover: {
    position: 'absolute',
    top: CONTROL_HEIGHT + Spacing.xs,
    right: 0,
    width: CELL * 7 + Spacing.md * 2,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 14px 36px rgba(22, 25, 45, 0.16)',
  },
  // Below the taller box, and left-aligned with it like a field's menu.
  popoverField: { top: FIELD_HEIGHT + Spacing.xs, left: 0, right: undefined },

  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.sm,
  },
  monthLabel: { flex: 1, textAlign: 'center' },
  monthArrow: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  weekRow: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCell: { borderRadius: Radius.sm },

  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
});
