/**
 * Console filter chrome: a single wrapping row of compact controls.
 *
 * Replaces the stack of full-width `SegmentedControl`s each list screen used to
 * render. A segmented control is a good phone affordance for two or three
 * mutually exclusive choices; at five options on a wide screen it becomes a
 * band of equal-weight buttons that buries the current selection and pushes the
 * data below the fold. A dropdown that reads "Status: Open" states the active
 * filter in place and costs one line regardless of option count.
 *
 * Deliberately local to src/components/admin, not promoted to
 * src/components/ui: this is desktop-pointer chrome (hover states, popover
 * menus) for one web-only surface. The design system's rule is to promote a
 * pattern once it is stable in two screens — these are used by six, but all six
 * are in this directory, and the barrel is bundled into the native app.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RequiredMark } from '@/components/ui/input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Control height shared by every toolbar member, so the row aligns. */
const CONTROL_HEIGHT = 36;
/** `Select`'s form-field height, matched to `Input` so a mixed form row aligns. */
const FIELD_HEIGHT = 52;

export function Toolbar({ children }: { children: ReactNode }) {
  return <View style={styles.toolbar}>{children}</View>;
}

/** Pushes what follows to the row's right edge. */
export function ToolbarSpacer() {
  return <View style={styles.spacer} />;
}

export type SelectOption<T extends string> = { label: string; value: T };

/**
 * A compact dropdown. The trigger always names the filter and its current
 * value ("Urgency: Critical"), so an active filter is legible without opening
 * the menu — the failure mode of the segmented row it replaces.
 */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  tintActive = true,
  variant = 'chip',
  icon,
  required,
  error,
}: {
  label: string;
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * False for a control that is always "set" to something — a sort order,
   * say — where there is no empty/neutral value to contrast against, so
   * tinting it would read as a permanently active filter that can never be
   * cleared.
   */
  tintActive?: boolean;
  /**
   * `chip` is the toolbar control: compact, inline, naming its filter and value
   * on one line. `field` is the same menu inside a form, with the label above a
   * full-width 52pt box — so a dropdown sitting next to an `Input` reads as a
   * peer field rather than a filter chip that wandered into the form.
   */
  variant?: 'chip' | 'field';
  /** Leading glyph. `field` only; a chip states its filter in words instead. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** `field` only: marks the label, as `Input` does. */
  required?: boolean;
  /** `field` only: an inline message under the box, as `Input` shows one. */
  error?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value) ?? options[0];
  // An empty value is the "no filter" case every list models as ''. Only a real
  // narrowing counts as active, and active state is carried by border and
  // weight as well as tint.
  const active = tintActive && value !== '';
  const field = variant === 'field';

  return (
    <View style={[styles.selectWrap, field ? styles.selectWrapField : null]}>
      {field ? (
        <ThemedText type="subhead" color="textSecondary" style={styles.fieldLabel}>
          {label}
          {required ? <RequiredMark /> : null}
        </ThemedText>
      ) : null}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
        style={({ hovered, pressed }) => [
          styles.control,
          field ? styles.fieldControl : null,
          {
            backgroundColor: field
              ? theme.surfaceSunken
              : active
                ? theme.brandSubtle
                : theme.surface,
            borderColor:
              field && error && !open
                ? theme.danger
                : open || (active && !field)
                  ? theme.brand
                  : theme.border,
          },
          hovered || pressed
            ? { borderColor: active && !field ? theme.brand : theme.borderStrong }
            : null,
        ]}>
        {field ? (
          icon ? (
            <Ionicons name={icon} size={18} color={open ? theme.brand : theme.textTertiary} />
          ) : null
        ) : (
          <ThemedText type="footnote" color="textSecondary">
            {label}
          </ThemedText>
        )}
        <ThemedText
          type={field ? 'body' : 'footnote'}
          style={[
            field ? styles.fieldValue : styles.selectValue,
            { color: active && !field ? theme.brand : theme.text },
          ]}
          numberOfLines={1}>
          {selected?.label ?? ''}
        </ThemedText>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={field ? 18 : 14}
          color={active && !field ? theme.brand : theme.textTertiary}
        />
      </Pressable>

      {open ? (
        <>
          {/* Catches the next click anywhere so the menu closes without the
              component having to own a document-level listener. */}
          <Pressable
            style={styles.backdrop as ViewStyle}
            accessibilityLabel="Close menu"
            onPress={() => setOpen(false)}
          />
          <View
            style={[
              styles.menu,
              field ? styles.menuField : null,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={({ hovered, pressed }) => [
                    styles.menuItem,
                    hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
                  ]}>
                  <ThemedText type="footnote" numberOfLines={1} style={styles.menuLabel}>
                    {option.label}
                  </ThemedText>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={14} color={theme.brand} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {field && error ? (
        <ThemedText type="footnote" color="danger" style={styles.fieldLabel}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Free-text filter. Styled to match `Select` so the row reads as one control set. */
export function SearchField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  grow,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  /**
   * Drops the compact width cap so the field fills the row. For a toolbar that
   * sits alone along a panel's top edge, where search is the main control
   * rather than one chip among many.
   */
  grow?: boolean;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.control,
        styles.search,
        grow ? styles.searchGrow : null,
        {
          backgroundColor: theme.surface,
          borderColor: focused ? theme.brand : value ? theme.borderStrong : theme.border,
        },
      ]}>
      <Ionicons name="search" size={14} color={theme.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        accessibilityLabel={accessibilityLabel}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.searchInput, { color: theme.text }]}
      />
      {value ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}>
          <Ionicons name="close-circle" size={14} color={theme.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Clears every filter at once. Rendered only when something is actually
 * narrowed, so the row does not carry a permanently dead control.
 */
export function ClearFilters({ onPress, count }: { onPress: () => void; count: number }) {
  const theme = useTheme();
  if (count === 0) return null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Clear ${count} ${count === 1 ? 'filter' : 'filters'}`}
      style={({ hovered, pressed }) => [
        styles.control,
        styles.clear,
        { borderColor: 'transparent' },
        hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
      ]}>
      <Ionicons name="close" size={14} color={theme.textSecondary} />
      <ThemedText type="footnote" color="textSecondary">
        Clear {count === 1 ? '1 filter' : `${count} filters`}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Numbered page strip: prev/next chevrons flanking a run of page numbers, the
 * current one filled solid. Collapses the run with an ellipsis once there are
 * more pages than fit, always keeping the first, the last, and a window around
 * the current page — so jumping to the end of a long list never requires
 * paging through every number between.
 */
export function Pager({
  page,
  pageCount,
  onChange,
}: {
  /** Zero-based. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const theme = useTheme();
  if (pageCount <= 1) return null;

  const items = pagerItems(page, pageCount);

  return (
    <View style={styles.pager} accessibilityRole="menubar" accessibilityLabel="Pagination">
      <PagerArrow
        icon="chevron-back"
        label="Previous page"
        disabled={page === 0}
        onPress={() => onChange(Math.max(0, page - 1))}
      />
      {items.map((item, i) =>
        item === 'ellipsis' ? (
          <View key={`ellipsis-${i}`} style={styles.pagerEllipsis}>
            <ThemedText type="footnote" color="textTertiary">
              …
            </ThemedText>
          </View>
        ) : (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: item === page }}
            accessibilityLabel={`Page ${item + 1}`}
            style={({ hovered, pressed }) => [
              styles.pagerNumber,
              item === page
                ? { backgroundColor: theme.brand }
                : hovered || pressed
                  ? { backgroundColor: theme.surfaceSunken }
                  : null,
            ]}>
            <ThemedText
              type="footnote"
              style={{ color: item === page ? theme.onBrand : theme.text, fontWeight: item === page ? '700' : '500' }}>
              {item + 1}
            </ThemedText>
          </Pressable>
        ),
      )}
      <PagerArrow
        icon="chevron-forward"
        label="Next page"
        disabled={page >= pageCount - 1}
        onPress={() => onChange(Math.min(pageCount - 1, page + 1))}
      />
    </View>
  );
}

function PagerArrow({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ hovered, pressed }) => [
        styles.pagerNumber,
        { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
        !disabled && (hovered || pressed) ? { backgroundColor: theme.surfaceSunken } : null,
      ]}>
      <Ionicons name={icon} size={16} color={disabled ? theme.textTertiary : theme.text} />
    </Pressable>
  );
}

/** First, last, and a window of 1 around the current page; gaps become a single ellipsis marker. */
function pagerItems(page: number, pageCount: number): (number | 'ellipsis')[] {
  const keep = new Set<number>([0, pageCount - 1, page]);
  if (page > 0) keep.add(page - 1);
  if (page < pageCount - 1) keep.add(page + 1);

  const sorted = [...keep].filter((n) => n >= 0 && n < pageCount).sort((a, b) => a - b);
  const items: (number | 'ellipsis')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) items.push('ellipsis');
    items.push(n);
  });
  return items;
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    width: '100%',
    overflow: 'visible',
    // Lifts the whole row — and so any open `Select` menu — above the content
    // that follows it. Without this the toolbar stacks at `auto`, and a later
    // sibling (a table card, a grid of donor cards) paints over the menu and
    // swallows its clicks. `selectWrap`'s own z-index only orders the controls
    // against each other, inside this context.
    zIndex: 20,
  },
  spacer: { flex: 1, minWidth: Spacing.sm },

  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: CONTROL_HEIGHT,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  selectWrap: { position: 'relative', zIndex: 10, overflow: 'visible' },
  selectValue: { fontWeight: '600', maxWidth: 160 },

  // The `field` variant: a label above a full-width box the height of `Input`.
  selectWrapField: { flex: 1, minWidth: 0, gap: Spacing.sm },
  fieldLabel: { marginLeft: Spacing.xs },
  fieldControl: { height: FIELD_HEIGHT, borderRadius: Radius.md, paddingHorizontal: Spacing.base },
  fieldValue: { flex: 1, minWidth: 0 },

  // `position: fixed` is web-only and intentional: the backdrop must cover the
  // viewport, not the toolbar's own box. Cast at the use site because RN's
  // ViewStyle type has no 'fixed'.
  backdrop: { position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 },
  menu: {
    position: 'absolute',
    top: CONTROL_HEIGHT + Spacing.xs,
    left: 0,
    minWidth: 200,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 10px 28px rgba(22, 25, 45, 0.12)',
  },
  // Drops below the taller box, and matches its width so the menu lines up with
  // the field rather than hanging off a 200pt minimum.
  menuField: { top: FIELD_HEIGHT + Spacing.xs + 28, right: 0, minWidth: 0 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
  },
  menuLabel: { flex: 1 },

  search: { flex: 1, minWidth: 180, maxWidth: 320 },
  searchGrow: { maxWidth: '100%' },
  // `outlineStyle` is a react-native-web property: the wrapper already draws a
  // focus border, so the browser's default ring would double it.
  searchInput: { flex: 1, fontSize: 13, outlineStyle: 'none' } as object,

  clear: { paddingHorizontal: Spacing.sm },

  pager: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  pagerNumber: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerEllipsis: { width: 20, alignItems: 'center', justifyContent: 'center' },
});
