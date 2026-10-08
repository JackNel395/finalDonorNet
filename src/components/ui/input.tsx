import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

export type InputProps = TextInputProps & {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  hint?: string;
  /**
   * A budget shown opposite the label — "24 / 65". For a field with a hard cap
   * the writer needs to see while typing, where burying the count in `hint`
   * means it is read once and then ignored.
   */
  counter?: string;
  /**
   * Marks the label with an asterisk and reports `aria-required`. The marker is
   * hidden from screen readers, which hear the required state instead.
   */
  required?: boolean;
};

export function Input({ label, icon, error, hint, counter, required, style, ...rest }: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? theme.danger : focused ? theme.brand : theme.border;

  return (
    <View style={styles.wrap}>
      {label || counter ? (
        <View style={styles.labelRow}>
          {label ? (
            <ThemedText type="subhead" color="textSecondary" style={styles.label}>
              {label}
              {required ? <RequiredMark /> : null}
            </ThemedText>
          ) : null}
          {counter ? (
            <ThemedText type="footnote" color={error ? 'danger' : 'textTertiary'}>
              {counter}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.field,
          { backgroundColor: theme.surfaceSunken, borderColor },
        ]}>
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? theme.brand : theme.textTertiary}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          style={[styles.input, webNoOutline, { color: theme.text, fontFamily: Fonts.sans }, style]}
          placeholderTextColor={theme.textTertiary}
          // The visible label is a sibling, not a <label for>, so the field
          // carries its own name unless the caller gives a more specific one.
          accessibilityLabel={label}
          {...(required ? ({ 'aria-required': true } as object) : null)}
          {...(error ? ({ 'aria-invalid': true } as object) : null)}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? (
        <ThemedText type="footnote" color="danger" style={styles.helper}>
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="footnote" color="textTertiary" style={styles.helper}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** The required-field asterisk, shared with the console's form labels. */
export function RequiredMark() {
  const theme = useTheme();
  return (
    <ThemedText
      type="subhead"
      style={{ color: theme.danger }}
      accessibilityElementsHidden
      importantForAccessibility="no"
      {...({ 'aria-hidden': true } as object)}>
      {' *'}
    </ThemedText>
  );
}

// The field's brand border is the focus ring; suppress the browser's default
// outline so web doesn't stack a second ring on top of it. `outlineStyle:
// 'none'` is a valid react-native-web style but missing from RN's TS types,
// and width alone can't disable a UA ring drawn with outline-style auto.
const webNoOutline =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  label: { marginLeft: Spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    minHeight: 52,
  },
  icon: { marginRight: Spacing.sm },
  input: { flex: 1, fontSize: 16, paddingVertical: Spacing.md },
  helper: { marginLeft: Spacing.xs },
});
