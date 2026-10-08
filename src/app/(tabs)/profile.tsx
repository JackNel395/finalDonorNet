/**
 * Profile & settings. Identity header, donor summary, quick links, appearance,
 * and sign-out. See design.md §Profile.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import {
  Avatar,
  BloodTypeGlyph,
  Card,
  ConfirmSheet,
  FadeIn,
  ScreenHeader,
  useToast,
} from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing, TabBarClearance } from '@/constants/theme';
import { useDonations, useProfile } from '@/hooks/api';
import { usePrepRemindersPref } from '@/hooks/use-prep-reminders';
import { usePushState } from '@/hooks/use-push';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { UNIVERSAL_DONOR } from '@/lib/blood';
import { cancelAllPrepReminders, cancelEligibleAgain } from '@/lib/notifications';
import { queryClient } from '@/lib/query';
import { removeItem, StorageKeys } from '@/lib/storage';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress?: () => void;
};

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: profile } = useProfile();
  const { data: donations = [] } = useDonations();
  const { data: pushPermission } = usePushState();
  const { data: prepReminders } = usePrepRemindersPref();
  const [confirmOut, setConfirmOut] = useState(false);

  if (!profile) return null;

  const totalUnits = donations.reduce((sum, d) => sum + d.units, 0);

  const account: Row[] = [
    {
      icon: 'person-outline',
      label: 'Personal information',
      detail: profile.email,
      onPress: () => router.push('/profile-edit'),
    },
    {
      icon: 'water-outline',
      label: 'Blood type',
      detail: profile.bloodType + (profile.bloodType === UNIVERSAL_DONOR ? ' · Universal' : ''),
      onPress: () => router.push('/blood-compatibility'),
    },
    {
      icon: 'location-outline',
      label: 'Location',
      detail: profile.city,
    },
    {
      icon: 'card-outline',
      label: 'Digital donor card',
      onPress: () => router.push('/donor-card'),
    },
  ];

  // Empty while anything is still loading: SettingRow only renders a detail
  // when it's truthy, so '' holds the space rather than flashing a wrong value.
  const notificationsDetail =
    pushPermission === 'unsupported'
      ? 'Unavailable'
      : pushPermission === undefined || prepReminders === undefined
        ? ''
        : pushPermission === 'granted'
          ? prepReminders
            ? 'On'
            : 'Off'
          : 'Needs permission';

  const preferences: Row[] = [
    {
      icon: 'notifications-outline',
      label: 'Notifications',
      detail: notificationsDetail,
      onPress: () => router.push('/notification-settings'),
    },
    { icon: 'shield-checkmark-outline', label: 'Privacy', detail: 'Standard' },
    { icon: 'moon-outline', label: 'Appearance', detail: 'System' },
    {
      icon: 'help-circle-outline',
      label: 'Help & support',
      onPress: () => toast.show('Support is a tap away — coming soon', 'info'),
    },
  ];

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + TabBarClearance },
        ]}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Profile" large={false} />

        <FadeIn>
          <Card style={styles.identity}>
            <Avatar name={profile.fullName} size={64} />
            <View style={styles.identityText}>
              <ThemedText type="title2">{profile.fullName}</ThemedText>
              <ThemedText type="subhead" color="textSecondary">
                Donor · {donations.length} donations
              </ThemedText>
            </View>
            <BloodTypeGlyph type={profile.bloodType} size="sm" filled />
          </Card>
        </FadeIn>

        <FadeIn delay={60}>
          <View style={styles.summary}>
            <SummaryStat value={String(donations.length)} label="Donations" />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SummaryStat value={String(totalUnits)} label="Units given" />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SummaryStat value={String(totalUnits * 3)} label="Lives touched" />
          </View>
        </FadeIn>

        <FadeIn delay={120}>
          <Section title="Account">
            {account.map((row, i) => (
              <SettingRow key={row.label} row={row} last={i === account.length - 1} />
            ))}
          </Section>
        </FadeIn>

        <FadeIn delay={180}>
          <Section title="Preferences">
            {preferences.map((row, i) => (
              <SettingRow key={row.label} row={row} last={i === preferences.length - 1} />
            ))}
          </Section>
        </FadeIn>

        <FadeIn delay={240}>
          <PressableScale
            haptic="medium"
            onPress={() => setConfirmOut(true)}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={[styles.signOut, { borderColor: theme.border }]}>
            <Ionicons name="log-out-outline" size={18} color={theme.danger} />
            <ThemedText type="bodyStrong" color="danger">
              Sign out
            </ThemedText>
          </PressableScale>
        </FadeIn>

        <ThemedText type="caption" color="textTertiary" style={styles.version}>
          DonorNet · v1.0.0
        </ThemedText>
      </ScrollView>

      <ConfirmSheet
        visible={confirmOut}
        title="Sign out?"
        message="You'll need to sign in again to access your donor profile and requests."
        confirmLabel="Sign out"
        destructive
        onCancel={() => setConfirmOut(false)}
        onConfirm={async () => {
          setConfirmOut(false);
          await authClient.signOut();
          queryClient.clear();
          // `queryClient.clear()` empties the cache but not the OS scheduler, so
          // without this the next person on this device inherits the previous
          // donor's reminders. The prep *preference* stays — it's device state.
          await cancelAllPrepReminders();
          await cancelEligibleAgain();
          await removeItem(StorageKeys.prepReminderSignature);
          router.replace('/');
        }}
      />
    </View>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryStat}>
      <ThemedText type="title2">{value}</ThemedText>
      <ThemedText type="footnote" color="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="footnote" color="textTertiary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      <Card padding={0} style={styles.sectionCard}>
        {children}
      </Card>
    </View>
  );
}

function SettingRow({ row, last }: { row: Row; last: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale
      scaleTo={0.99}
      onPress={row.onPress}
      disabled={!row.onPress}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={row.label}
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}>
      <View style={[styles.rowIcon, { backgroundColor: theme.surfaceSunken }]}>
        <Ionicons name={row.icon} size={18} color={theme.textSecondary} />
      </View>
      <ThemedText type="body" style={styles.rowLabel}>
        {row.label}
      </ThemedText>
      {row.detail ? (
        <ThemedText type="subhead" color="textTertiary" numberOfLines={1} style={styles.rowDetail}>
          {row.detail}
        </ThemedText>
      ) : null}
      {row.onPress ? (
        <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.base, gap: Spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  identityText: { flex: 1, gap: 2 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryStat: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: StyleSheet.hairlineWidth, height: 36 },
  section: { gap: Spacing.sm },
  sectionTitle: { marginLeft: Spacing.xs, letterSpacing: 0.6 },
  sectionCard: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1 },
  rowDetail: { maxWidth: 140, textAlign: 'right' },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  devReset: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  version: { textAlign: 'center', letterSpacing: 0.4 },
});
