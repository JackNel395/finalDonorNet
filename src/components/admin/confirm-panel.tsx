/**
 * The console's confirmation: a narrow right-edge `Drawer` that asks one
 * question and offers two answers.
 *
 * `ConfirmSheet` is the donor app's pattern and the right one on a phone. On a
 * desktop console it is not: a bottom sheet spans the whole window, a long way
 * from the button that raised it, and reads as the page breaking rather than
 * as a question. The design system rules out the obvious alternative, a
 * centered web modal (`PATTERNS.md`). The console already has an edge-anchored
 * layer — the drawer its forms open in — so a confirmation is that same layer,
 * narrower, with the question and its consequence in the body and the two
 * answers pinned in the footer where every console drawer keeps them.
 *
 * Same props as `ConfirmSheet`, so a console screen swaps one for the other
 * without touching its logic. Like the sheet it has no busy state: callers
 * close it first, then mutate, and report the result in a toast.
 *
 * A backdrop press, Escape or the close button all mean "cancel" — the
 * consequential answer always takes an explicit press.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Drawer } from '@/components/admin/drawer';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ConfirmPanel({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tints the confirm button and the icon as danger. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const tint = destructive ? theme.danger : theme.brand;

  return (
    <Drawer
      visible={visible}
      title={title}
      width={440}
      onRequestClose={onCancel}
      footer={
        <>
          <Button
            label={confirmLabel}
            variant={destructive ? 'danger' : 'primary'}
            icon={destructive ? 'warning-outline' : 'checkmark'}
            onPress={onConfirm}
          />
          <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
        </>
      }>
      <View style={styles.body}>
        <View
          style={[
            styles.icon,
            { backgroundColor: destructive ? theme.dangerSubtle : theme.brandSubtle },
          ]}>
          <Ionicons
            name={destructive ? 'alert-circle-outline' : 'help-circle-outline'}
            size={24}
            color={tint}
          />
        </View>
        {message ? (
          <ThemedText type="body" color="textSecondary">
            {message}
          </ThemedText>
        ) : null}
      </View>
    </Drawer>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.base },
  icon: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
