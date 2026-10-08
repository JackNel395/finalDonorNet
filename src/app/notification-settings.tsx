/**
 * Notification preferences (modal). One master toggle for donation-preparation
 * reminders, plus permission recovery when the OS grant is missing.
 *
 * A route rather than an inline expansion in Profile: `SettingRow` already draws
 * a chevron whenever it has an `onPress`, and permission recovery needs room for
 * an explanatory card and an action.
 *
 * Reminders here are general preparation guidance. Nothing on this screen states
 * an eligibility rule — final eligibility is always determined by trained
 * donation-center staff.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, FadeIn, ScreenHeader, useToast } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAppointments } from '@/hooks/api';
import { usePrepRemindersPref, useSetPrepRemindersPref } from '@/hooks/use-prep-reminders';
import { useEnablePush, usePushState } from '@/hooks/use-push';
import { useTheme } from '@/hooks/use-theme';
import { upcomingAppointment } from '@/lib/booking';
import { haptics } from '@/lib/haptics';
import { schedulePrepReminders } from '@/lib/notifications';

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: permission } = usePushState();
  const { data: enabled } = usePrepRemindersPref();
  const { data: appointments } = useAppointments();
  const setPref = useSetPrepRemindersPref();
  const enablePush = useEnablePush();

  const onToggle = (next: boolean) => {
    setPref.mutate(next, {
      onSuccess: () => {
        haptics.success();
        toast.show(
          next ? 'Preparation reminders on.' : 'Preparation reminders off.',
          'success',
        );
      },
      onError: () => {
        toast.show('Could not save your reminder setting. Please try again.', 'danger');
      },
    });
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing['3xl'] },
      ]}
      showsVerticalScrollIndicator={false}>
      <ScreenHeader
        title="Notifications"
        showBack
        onBack={() => router.back()}
        large={false}
      />

      {/* Permission recovery. State is carried by icon + heading + body, so it
          reads correctly in greyscale. Shown only when something is missing. */}
      {permission && permission !== 'granted' ? (
        <FadeIn>
          <Card variant="tinted" padding="base">
            {permission === 'undetermined' ? (
              <>
                <PermissionBody
                  icon="notifications-outline"
                  title="Turn on notifications"
                  body="Reminders are sent by your device. Allow notifications so we can send them."
                />
                <Button
                  label="Allow notifications"
                  variant="secondary"
                  size="sm"
                  loading={enablePush.isPending}
                  // Writes qk.push, which the reconciler watches — a grant
                  // schedules immediately, with no reload.
                  onPress={() => enablePush.mutate()}
                  style={styles.cardAction}
                />
              </>
            ) : permission === 'denied' ? (
              <>
                <PermissionBody
                  icon="notifications-off-outline"
                  title="Notifications are turned off"
                  body="Reminders can't be delivered until you allow notifications for DonorNet in your device settings."
                />
                <Button
                  label="Open settings"
                  variant="secondary"
                  size="sm"
                  onPress={() => void Linking.openSettings()}
                  style={styles.cardAction}
                />
              </>
            ) : (
              <PermissionBody
                icon="phone-portrait-outline"
                title="Reminders need a phone or tablet"
                body="Donation reminders aren't available on this device."
              />
            )}
          </Card>
        </FadeIn>
      ) : null}

      {/* The preference stays interactive in every permission state — a
          preference is a preference, and the card above explains why nothing
          will arrive yet. */}
      <FadeIn delay={60}>
        <Card padding={0} style={styles.card}>
          <ToggleRow
            title="Donation preparation reminders"
            subtitle="7 days before, 2 days before, and the morning of your donation."
            hint="Sends reminders 7 days, 2 days, and the morning of your donation"
            checked={enabled ?? true}
            pending={setPref.isPending}
            onChange={onToggle}
          />
        </Card>
      </FadeIn>

      <ThemedText type="footnote" color="textSecondary">
        Reminders are scheduled on this device for your next booked donation.
        They&apos;re general preparation tips — final eligibility is always determined
        by trained donation-center staff.
      </ThemedText>

      {__DEV__ ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send test reminders now"
          onPress={() => {
            const upcoming = appointments ? upcomingAppointment(appointments) : undefined;
            if (!upcoming) {
              toast.show('Book an appointment first.', 'info');
              return;
            }
            void schedulePrepReminders({
              appointmentId: upcoming.id,
              appointmentISO: upcoming.date,
              devFireInSeconds: 15,
            });
            toast.show('Test reminders queued — background the app.', 'info');
          }}
          style={[styles.devRow, { borderColor: theme.border }]}>
          <Ionicons name="flask-outline" size={16} color={theme.textTertiary} />
          <ThemedText type="footnote" color="textTertiary">
            Send test reminders now (dev)
          </ThemedText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function PermissionBody({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.permissionRow}>
      <View style={[styles.permissionIcon, { backgroundColor: theme.surface }]}>
        <Ionicons name={icon} size={20} color={theme.textSecondary} />
      </View>
      <View style={styles.permissionText}>
        <ThemedText type="bodyStrong">{title}</ThemedText>
        <ThemedText type="footnote" color="textSecondary">
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * Local to this screen, per the promotion rule: one consumer, and wrapping a
 * platform control for a custom skin is exactly what we shouldn't do. The row
 * owns the gesture and is the single accessibility node; the `Switch` inside is
 * hidden from the screen reader and ignores touches, so there is one target
 * rather than two.
 */
function ToggleRow({
  title,
  subtitle,
  hint,
  checked,
  pending,
  onChange,
}: {
  title: string;
  subtitle: string;
  hint: string;
  checked: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={pending}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: pending }}
      accessibilityLabel={title}
      accessibilityHint={hint}
      style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <ThemedText type="body">{title}</ThemedText>
        <ThemedText type="footnote" color="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <Switch
          value={checked}
          trackColor={{ false: theme.borderStrong, true: theme.brand }}
          // Android draws its own thumb; iOS keeps the platform white one.
          thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
          ios_backgroundColor={theme.borderStrong}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.lg,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: { overflow: 'hidden' },
  cardAction: { marginTop: Spacing.md, alignSelf: 'flex-start' },
  permissionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  permissionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: { flex: 1, gap: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 56,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  toggleText: { flex: 1, gap: 2 },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
});
