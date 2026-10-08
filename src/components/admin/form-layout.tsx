/**
 * The furniture every console drawer form shares: labelled field groups, a
 * consequence notice, a label for controls that are not an `Input`, and the
 * "discard what you typed?" guard.
 *
 * Extracted from `new-request-form.tsx` once the appointment, center,
 * announcement and article forms needed the same pieces. What is shared is the
 * *frame* — spacing, label style, the close-with-unsaved-input rule — never the
 * fields themselves: each form keeps its own fields, validation and copy.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, RequiredMark } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A labelled band of related fields.
 *
 * A long form in a narrow column is a long list to read as one run; the few
 * questions it actually asks are what an operator holds in their head while
 * filling it in, so those are what the bands are named for.
 *
 * Give earlier bands a higher `zIndex` when they contain a menu, so an open
 * dropdown covers the bands below it rather than being painted over by them.
 */
export function FormSection({
  title,
  style,
  children,
}: {
  title: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={[styles.group, style]}>
      <ThemedText type="caption" color="textTertiary" style={styles.groupTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

/** Side-by-side fields that wrap to one column on a phone-width drawer. */
export function FormRow({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** One cell of a `FormRow`. `narrow` fits three to a row in a 560pt drawer. */
export function FormCell({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <View style={narrow ? styles.narrow : styles.cell}>{children}</View>;
}

/**
 * Label, control, and an optional hint or error underneath — for the controls
 * that are not an `Input` (segmented controls, pickers) so they line up with
 * the ones that are.
 */
export function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="subhead" color="textSecondary" style={styles.inset}>
        {label}
        {required ? <RequiredMark /> : null}
      </ThemedText>
      {children}
      {error ? (
        <ThemedText type="footnote" color="danger" style={styles.inset}>
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="footnote" color="textTertiary" style={styles.inset}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** What the asterisk means, said once at the top of a form that uses it. */
export function RequiredLegend() {
  return (
    <ThemedText type="footnote" color="textTertiary">
      Fields marked
      <RequiredMark />
      {' are required.'}
    </ThemedText>
  );
}

/**
 * The consequence of saving, stated on the form rather than only in a confirm
 * or a toast afterwards. `warning` for something that cannot be taken back,
 * `info` for something that is merely immediate.
 */
export function FormNotice({
  tone = 'warning',
  children,
}: {
  tone?: 'warning' | 'info';
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: tone === 'warning' ? theme.warningSubtle : theme.infoSubtle },
      ]}>
      <ThemedText type="footnote" color="textSecondary">
        {children}
      </ThemedText>
    </View>
  );
}

/**
 * The close rule every drawer form follows. A backdrop press, Escape, Cancel,
 * or the close button all *request* a close:
 *
 *   - mid-save it does nothing — the panel is about to report on the result;
 *   - with unsaved input it asks first, because a stray click outside the panel
 *     should not throw away a paragraph of typing;
 *   - otherwise it closes.
 *
 * The question is asked *in the drawer's footer*, in place of its actions,
 * rather than in a sheet or a second panel. A sheet is the donor app's phone pattern;
 * on a desktop console it spans the whole window, far from the panel it is
 * about. In the footer it sits where the operator's pointer already is, and
 * the form stays visible above it so they can see what they would lose.
 *
 * Wrap the drawer's normal footer in `footer(...)`. A second close request
 * while asking — Escape again, say — means "keep editing", never "discard":
 * the destructive answer always takes an explicit press.
 */
export function useDiscardGuard({
  dirty,
  busy,
  onClose,
  title,
  message,
}: {
  dirty: boolean;
  busy: boolean;
  onClose: () => void;
  title: string;
  message: string;
}) {
  const [discarding, setDiscarding] = useState(false);

  const requestClose = () => {
    if (busy) return;
    if (discarding) {
      setDiscarding(false);
      return;
    }
    if (dirty) {
      setDiscarding(true);
      return;
    }
    onClose();
  };

  const footer = (actions: ReactNode) =>
    discarding ? (
      <FooterPrompt
        title={title}
        message={message}
        actions={
          <>
            {/* The safe answer first and as the primary: the operator was one
                stray click away from losing their work, not asking to lose it. */}
            <Button label="Keep editing" onPress={() => setDiscarding(false)} />
            <Button
              label="Discard"
              variant="dangerOutline"
              icon="trash-outline"
              onPress={() => {
                setDiscarding(false);
                onClose();
              }}
            />
          </>
        }
      />
    ) : (
      actions
    );

  return { requestClose, discarding, footer };
}

/**
 * A question asked in a drawer's footer, in place of its actions — the
 * console's in-panel confirmation. Used for "discard what you typed?" and for
 * any last check before a form submits something that cannot be taken back.
 * The form stays visible above it, so the operator can see what they are
 * confirming. `danger` for an irreversible consequence, `warning` otherwise.
 */
export function FooterPrompt({
  title,
  message,
  tone = 'warning',
  actions,
}: {
  title: string;
  message: string;
  tone?: 'warning' | 'danger';
  actions: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={styles.prompt}
      // Announced when it appears, since it replaces the buttons a screen
      // reader user was just on.
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive">
      <View style={styles.promptText}>
        <View
          style={[
            styles.promptIcon,
            { backgroundColor: tone === 'danger' ? theme.dangerSubtle : theme.warningSubtle },
          ]}>
          <Ionicons
            name="alert-circle-outline"
            size={20}
            color={tone === 'danger' ? theme.danger : theme.warning}
          />
        </View>
        <View style={styles.promptCopy}>
          <ThemedText type="headline">{title}</ThemedText>
          <ThemedText type="footnote" color="textSecondary">
            {message}
          </ThemedText>
        </View>
      </View>
      <View style={styles.promptActions}>{actions}</View>
    </View>
  );
}

/** "24 / 120" for a capped text field — see `Input`'s `counter`. */
export function charCount(value: string, max: number): string {
  return `${value.trim().length} / ${max}`;
}

export const formStyles = StyleSheet.create({
  // Descending z-index for bands holding a menu; see `FormSection`.
  z3: { zIndex: 3 },
  z2: { zIndex: 2 },
  textArea: { minHeight: 96, paddingTop: Spacing.md, textAlignVertical: 'top' },
});

const styles = StyleSheet.create({
  group: { gap: Spacing.base, overflow: 'visible' },
  groupTitle: { letterSpacing: 1.1 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: Spacing.base,
    overflow: 'visible',
  },
  cell: { flex: 1, minWidth: 200, overflow: 'visible' },
  narrow: { flex: 1, minWidth: 140, overflow: 'visible' },
  field: { gap: Spacing.sm },
  inset: { marginLeft: Spacing.xs },
  notice: { padding: Spacing.base, borderRadius: Radius.md },

  // Fills the footer row the actions normally occupy.
  prompt: { flex: 1, minWidth: 0, gap: Spacing.base },
  promptText: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  promptIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptCopy: { flex: 1, minWidth: 0, gap: 2 },
  promptActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
