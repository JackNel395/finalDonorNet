/**
 * Appointment detail. Full context for a single donation appointment: center,
 * date/time, address, donation type, and status — with real actions to cancel
 * an upcoming visit or book another once it's done. See design.md §Donor.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, ConfirmSheet, EmptyState, FadeIn, ScreenHeader, useToast } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAppointment, useCancelAppointment, useCompleteAppointment } from '@/hooks/api';
import { useTheme } from '@/hooks/use-theme';
import { PH_DONATION_INTERVAL_DAYS } from '@/lib/blood';
import { DONATION_TYPE_LABEL } from '@/lib/booking';
import { dayOfMonth, longDate, monthAbbrev, timeOfDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import type { Appointment } from '@/types/domain';

const STATUS_TONE: Record<Appointment['status'], 'success' | 'warning' | 'neutral'> = {
  confirmed: 'success',
  pending: 'warning',
  completed: 'neutral',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<Appointment['status'], string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function AppointmentDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: appointment, isLoading } = useAppointment(id);
  const cancelAppointment = useCancelAppointment();
  const completeAppointment = useCompleteAppointment();

  const [cancelling, setCancelling] = useState(false);
  const [completing, setCompleting] = useState(false);

  if (!appointment) {
    // Still loading the cached list — hold rather than flashing "not found".
    if (isLoading) return <View style={[styles.flex, { paddingTop: insets.top }]} />;
    return (
      <View style={[styles.flex, { paddingTop: insets.top + Spacing.lg }]}>
        <ScreenHeader title="Appointment" showBack onBack={() => router.back()} large={false} />
        <EmptyState
          icon="calendar-outline"
          title="Appointment not found"
          subtitle="This appointment may have been cancelled or is no longer available."
        />
      </View>
    );
  }

  const isActive = appointment.status === 'confirmed' || appointment.status === 'pending';

  const onCancel = async () => {
    setCancelling(false);
    try {
      await cancelAppointment.mutateAsync(appointment.id);
      haptics.success();
      toast.show('Appointment cancelled.', 'success');
    } catch {
      haptics.error();
      toast.show('Could not cancel your appointment. Please try again.', 'danger');
    }
  };

  const onComplete = async () => {
    setCompleting(false);
    try {
      await completeAppointment.mutateAsync(appointment.id);
      haptics.success();
      toast.show('Donation recorded — thank you! 🩸', 'success');
    } catch {
      haptics.error();
      toast.show('Could not record your donation. Please try again.', 'danger');
    }
  };

  const directions = () => {
    const query = encodeURIComponent(`${appointment.centerName} ${appointment.address}`);
    void Linking.openURL(`https://maps.google.com/?q=${query}`);
  };

  return (
    <>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Your appointment"
          showBack
          onBack={() => router.back()}
          large={false}
          trailing={<Badge label={STATUS_LABEL[appointment.status]} tone={STATUS_TONE[appointment.status]} dot />}
        />

        {/* Date + center hero */}
        <FadeIn>
          <Card style={styles.hero} variant="tinted" tint={theme.infoSubtle}>
            <View style={[styles.dateBadge, { backgroundColor: theme.surface }]}>
              <ThemedText type="caption" color="brand">
                {monthAbbrev(appointment.date).toUpperCase()}
              </ThemedText>
              <ThemedText type="title2" color="brand">
                {dayOfMonth(appointment.date)}
              </ThemedText>
            </View>
            <View style={styles.heroText}>
              <ThemedText type="title2">{appointment.centerName}</ThemedText>
              <ThemedText type="subhead" color="textSecondary">
                {longDate(appointment.date)}
              </ThemedText>
            </View>
          </Card>
        </FadeIn>

        {/* Details */}
        <FadeIn delay={60}>
          <Card padding="base">
            <DetailRow icon="time-outline" label="Time" value={timeOfDay(appointment.date)} />
            <DetailRow icon="water-outline" label="Donation" value={DONATION_TYPE_LABEL[appointment.type]} />
            <DetailRow icon="location-outline" label="Address" value={appointment.address} last />
          </Card>
        </FadeIn>

        {/* Preparation — the one entry point that works everywhere, including
            web, where notifications don't exist at all. */}
        {isActive ? (
          <FadeIn delay={100}>
            <Card
              onPress={() => router.push({ pathname: '/prepare', params: { id: appointment.id } })}
              accessibilityLabel="How to prepare for your donation">
              <View style={styles.linkRow}>
                <View style={[styles.linkIcon, { backgroundColor: theme.surfaceSunken }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={theme.brand} />
                </View>
                <ThemedText type="bodyStrong" style={styles.linkText}>
                  How to prepare
                </ThemedText>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </View>
            </Card>
          </FadeIn>
        ) : null}

        {/* Directions — a helpful secondary action for an upcoming visit */}
        {isActive ? (
          <FadeIn delay={120}>
            <Card onPress={directions} accessibilityLabel="Get directions to the center">
              <View style={styles.linkRow}>
                <View style={[styles.linkIcon, { backgroundColor: theme.surfaceSunken }]}>
                  <Ionicons name="navigate-outline" size={18} color={theme.brand} />
                </View>
                <ThemedText type="bodyStrong" style={styles.linkText}>
                  Get directions
                </ThemedText>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </View>
            </Card>
          </FadeIn>
        ) : null}
      </ScrollView>

      {/* Action bar */}
      <View
        style={[
          styles.actionBar,
          { backgroundColor: theme.surfaceElevated, borderColor: theme.border, paddingBottom: insets.bottom || Spacing.base },
        ]}>
        {isActive ? (
          <>
            <Button
              label="Cancel"
              variant="secondary"
              icon="close"
              loading={cancelAppointment.isPending}
              onPress={() => setCancelling(true)}
              style={styles.barButton}
            />
            <Button
              label="Mark as complete"
              icon="checkmark-circle"
              loading={completeAppointment.isPending}
              onPress={() => setCompleting(true)}
              style={styles.barButton}
            />
          </>
        ) : (
          <Button
            label="Book another donation"
            icon="calendar"
            fullWidth
            onPress={() => router.replace('/book')}
          />
        )}
      </View>

      <ConfirmSheet
        visible={cancelling}
        title="Cancel this appointment?"
        message="Your slot will be released so someone else can book it. You can always schedule a new visit."
        confirmLabel="Cancel appointment"
        cancelLabel="Keep it"
        destructive
        onConfirm={onCancel}
        onCancel={() => setCancelling(false)}
      />

      <ConfirmSheet
        visible={completing}
        title="Mark this donation complete?"
        message={`This records the donation to your history and starts your ${PH_DONATION_INTERVAL_DAYS}-day recovery countdown. Only confirm after you've actually donated.`}
        confirmLabel="Yes, I donated"
        cancelLabel="Not yet"
        onConfirm={onComplete}
        onCancel={() => setCompleting(false)}
      />
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.detailRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <View style={[styles.detailIcon, { backgroundColor: theme.surfaceSunken }]}>
        <Ionicons name={icon} size={16} color={theme.textSecondary} />
      </View>
      <ThemedText type="subhead" color="textSecondary" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText type="subhead" style={styles.detailValue} numberOfLines={2}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  dateBadge: { width: 56, height: 56, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  detailIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  detailLabel: { width: 88 },
  detailValue: { flex: 1, textAlign: 'right' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  linkText: { flex: 1 },
  linkIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barButton: { flex: 1 },
});
