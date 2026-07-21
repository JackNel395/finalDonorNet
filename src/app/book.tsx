/**
 * Book donation appointment (modal). Pick a center, day, and time slot, then
 * confirm. The date and time pickers only offer what `lib/booking.ts` considers
 * bookable — nothing in the past, nothing inside the donor's recovery window —
 * and the screen stands down entirely while an appointment is already booked.
 * See design.md §Appointments, §8 States.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EnableLocationCard } from '@/components/enable-location-card';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, FadeIn, ScreenHeader, Skeleton, useToast } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useAppointments, useBookAppointment, useCenters, useDonations, useProfile } from '@/hooks/api';
import { useTheme } from '@/hooks/use-theme';
import { ApiClientError } from '@/lib/api';
import { computeEligibility, effectiveLastDonation } from '@/lib/blood';
import {
  bookableDays,
  DONATION_TYPES,
  DONATION_TYPE_LABEL,
  isSlotBookable,
  slotDateTime,
  SLOTS,
  upcomingAppointment,
} from '@/lib/booking';
import { distanceLabel, longDate, timeOfDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import type { Donation, DonationCenter } from '@/types/domain';

type DonationType = Donation['type'];
type CenterKind = DonationCenter['kind'];

/**
 * Center kind → list icon. A `Record` rather than a ternary on purpose: the
 * previous `kind === 'blood_bank' ? … : …` silently lumped campaigns in with
 * hospitals, so the Talisay bloodletting drive — a one-day event in a city hall —
 * wore a hospital icon. Keyed on the union, a new `kind` now fails the typecheck
 * instead of quietly picking a wrong-but-plausible icon.
 */
const KIND_ICON: Record<CenterKind, keyof typeof Ionicons.glyphMap> = {
  hospital: 'business',
  blood_bank: 'water',
  campaign: 'megaphone',
};

const TYPE_META: Record<DonationType, { detail: string; icon: keyof typeof Ionicons.glyphMap }> = {
  whole: { detail: 'The most common donation', icon: 'water' },
  plasma: { detail: 'Cells returned to you', icon: 'flask' },
  platelets: { detail: 'For cancer & surgery care', icon: 'shield-half' },
  power_red: { detail: 'Two units of red cells', icon: 'water' },
};

function dayTile(iso: string) {
  const d = new Date(iso);
  return {
    iso,
    label: String(d.getDate()),
    dow: d.toLocaleDateString(undefined, { weekday: 'short' }),
    // Spelled out for screen readers: "Wed 5" is ambiguous across a month edge.
    a11y: d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

export default function BookScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const centersQuery = useCenters();
  const profileQuery = useProfile();
  const donationsQuery = useDonations();
  const appointmentsQuery = useAppointments();
  const bookAppointment = useBookAppointment();

  const centers = centersQuery.data ?? [];

  const lastDonationISO = effectiveLastDonation(profileQuery.data, donationsQuery.data);
  const eligibility = useMemo(() => computeEligibility(lastDonationISO), [lastDonationISO]);
  const upcoming = useMemo(
    () => upcomingAppointment(appointmentsQuery.data ?? []),
    [appointmentsQuery.data],
  );
  // Recomputed once the recovery window is known, so the strip can never offer
  // a date the donor is not yet eligible for.
  const days = useMemo(() => bookableDays(lastDonationISO).map(dayTile), [lastDonationISO]);

  const [centerId, setCenterId] = useState('');
  const [type, setType] = useState<DonationType>('whole');
  const [dayChoice, setDayChoice] = useState<string | null>(null);
  const [slotChoice, setSlotChoice] = useState<string | null>(null);

  // Derived, not synced: the center list and day strip both settle after the
  // first render, so a stale choice has to fall back rather than linger.
  const center = centers.find((c) => c.id === centerId) ?? centers[0];
  const dayIso = days.find((d) => d.iso === dayChoice)?.iso ?? days[0].iso;
  const slot = slotChoice && isSlotBookable(dayIso, slotChoice, lastDonationISO) ? slotChoice : null;

  const canConfirm = Boolean(center && slot && !bookAppointment.isPending);

  const confirm = async () => {
    if (!center || !slot || bookAppointment.isPending) {
      if (!center || !slot) haptics.error();
      return;
    }
    try {
      await bookAppointment.mutateAsync({
        centerId: center.id,
        date: slotDateTime(dayIso, slot).toISOString(),
        type,
      });
      haptics.success();
      toast.show('Appointment confirmed', 'success');
      router.back();
    } catch (err) {
      haptics.error();
      // The server's rejections (recovery window, an appointment booked from
      // another device) explain themselves better than a generic retry line.
      const message =
        err instanceof ApiClientError && err.status >= 400 && err.status < 500
          ? err.message
          : 'Could not book the appointment. Please try again.';
      toast.show(message, 'danger');
    }
  };

  const header = (
    <ScreenHeader
      title="Book donation"
      subtitle="Choose a center and time that works for you"
      showBack
      onBack={() => router.back()}
      large={false}
    />
  );

  // Hold rather than render a form built on defaults that are about to shift:
  // the day strip depends on the recovery window and the whole screen depends
  // on whether an appointment is already booked. On device each query is a real
  // round-trip, so show a skeleton meanwhile. See memory: web preview hides
  // native latency.
  if (
    profileQuery.isPending ||
    donationsQuery.isPending ||
    appointmentsQuery.isPending ||
    centersQuery.isPending
  ) {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing['4xl'] },
        ]}
        showsVerticalScrollIndicator={false}>
        {header}
        <BookSkeleton />
      </ScrollView>
    );
  }

  // One upcoming appointment at a time — offering the form here would only lead
  // to a rejected confirm, so show the booking they already have instead.
  if (upcoming) {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing['4xl'] },
        ]}
        showsVerticalScrollIndicator={false}>
        {header}
        <FadeIn>
          <Card variant="tinted" tint={theme.infoSubtle}>
            <View style={styles.noticeRow}>
              <Ionicons name="calendar" size={22} color={theme.info} />
              <View style={styles.noticeBody}>
                <ThemedText type="bodyStrong">You already have a visit booked</ThemedText>
                <ThemedText type="subhead" color="textSecondary">
                  {upcoming.centerName}
                </ThemedText>
                <ThemedText type="subhead" color="textSecondary">
                  {longDate(upcoming.date)} at {timeOfDay(upcoming.date)}
                </ThemedText>
              </View>
            </View>
          </Card>
        </FadeIn>
        <ThemedText type="footnote" color="textTertiary" style={styles.noticeFoot}>
          You can hold one appointment at a time. Cancel this one to book a different date.
        </ThemedText>
        <Button
          label="View appointment"
          fullWidth
          icon="calendar-outline"
          onPress={() => router.push(`/appointment/${upcoming.id}`)}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing['4xl'] + Spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}>
      {header}

      {/* Recovery window — the strip below already starts at the eligible day,
          so this explains why earlier dates are missing rather than gating. */}
      {!eligibility.eligible ? (
        <FadeIn>
          <Card variant="tinted" tint={theme.warningSubtle} padding="base">
            <View style={styles.noticeRow}>
              <Ionicons name="time-outline" size={20} color={theme.warning} />
              <View style={styles.noticeBody}>
                <ThemedText type="bodyStrong">Still recovering</ThemedText>
                <ThemedText type="footnote" color="textSecondary">
                  You can donate again from {longDate(eligibility.nextEligibleDate.toISOString())} (
                  {eligibility.daysRemaining} days). Earlier dates aren&apos;t offered.
                </ThemedText>
              </View>
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {/* Ordering below is by seeded distance until location is granted. */}
      <EnableLocationCard />

      {/* Center selection */}
      <FadeIn>
        <View style={[styles.section, styles.sectionRow]}>
          <ThemedText type="headline">Center</ThemedText>
          {Platform.OS !== 'web' ? (
            <PressableScale
              onPress={() => router.push('/map')}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel="View centers on a map"
              style={styles.mapLink}>
              <Ionicons name="map-outline" size={16} color={theme.brand} />
              <ThemedText type="subhead" color="brand">
                Map
              </ThemedText>
            </PressableScale>
          ) : null}
        </View>
        <View style={styles.stack}>
          {centers.map((c) => {
            const active = c.id === center?.id;
            return (
              <Card
                key={c.id}
                onPress={() => {
                  haptics.selection();
                  setCenterId(c.id);
                }}
                padding="base"
                style={[styles.centerCard, active && { borderColor: theme.brand, borderWidth: 1.5 }]}>
                <View style={styles.centerRow}>
                  <View style={[styles.centerIcon, { backgroundColor: active ? theme.brandSubtle : theme.surfaceSunken }]}>
                    <Ionicons
                      name={KIND_ICON[c.kind]}
                      size={20}
                      color={active ? theme.brand : theme.textSecondary}
                    />
                  </View>
                  <View style={styles.centerBody}>
                    <ThemedText type="bodyStrong" numberOfLines={1}>
                      {c.name}
                    </ThemedText>
                    <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
                      {distanceLabel(c.distanceKm)} · {c.openNow ? 'Open now' : 'Closed'} · ★ {c.rating.toFixed(1)}
                    </ThemedText>
                  </View>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={active ? theme.brand : theme.borderStrong}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      </FadeIn>

      {/* Donation type */}
      <FadeIn delay={60}>
        <ThemedText type="headline" style={styles.section}>
          Donation type
        </ThemedText>
        <View style={styles.typeGrid}>
          {DONATION_TYPES.map((value) => {
            const active = value === type;
            const meta = TYPE_META[value];
            const label = DONATION_TYPE_LABEL[value];
            return (
              <PressableScale
                key={value}
                onPress={() => {
                  haptics.selection();
                  setType(value);
                }}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel={`${label}. ${meta.detail}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.typeTile,
                  {
                    backgroundColor: active ? theme.brandSubtle : theme.surfaceSunken,
                    borderColor: active ? theme.brand : theme.border,
                  },
                ]}>
                <View style={styles.typeHead}>
                  <Ionicons name={meta.icon} size={18} color={active ? theme.brand : theme.textSecondary} />
                  <ThemedText type="bodyStrong" color={active ? 'brand' : 'text'}>
                    {label}
                  </ThemedText>
                </View>
                <ThemedText type="caption" color="textSecondary" numberOfLines={1}>
                  {meta.detail}
                </ThemedText>
              </PressableScale>
            );
          })}
        </View>
      </FadeIn>

      {/* Day selection */}
      <FadeIn delay={120}>
        <ThemedText type="headline" style={styles.section}>
          Date
        </ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {days.map((d) => {
            const active = d.iso === dayIso;
            return (
              <PressableScale
                key={d.iso}
                onPress={() => {
                  haptics.selection();
                  setDayChoice(d.iso);
                }}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel={d.a11y}
                accessibilityState={{ selected: active }}
                style={[
                  styles.day,
                  { backgroundColor: active ? theme.brand : theme.surfaceSunken, borderColor: active ? theme.brand : theme.border },
                ]}>
                <ThemedText type="caption" style={{ color: active ? theme.onBrand : theme.textSecondary }}>
                  {d.dow.toUpperCase()}
                </ThemedText>
                <ThemedText type="title2" style={{ color: active ? theme.onBrand : theme.text }}>
                  {d.label}
                </ThemedText>
              </PressableScale>
            );
          })}
        </ScrollView>
      </FadeIn>

      {/* Time slots */}
      <FadeIn delay={180}>
        <ThemedText type="headline" style={styles.section}>
          Time
        </ThemedText>
        <View style={styles.slotGrid}>
          {SLOTS.map((s) => {
            const bookable = isSlotBookable(dayIso, s, lastDonationISO);
            const active = s === slot;
            return (
              <PressableScale
                key={s}
                onPress={() => {
                  haptics.selection();
                  setSlotChoice(s);
                }}
                haptic={false}
                disabled={!bookable}
                accessibilityRole="button"
                accessibilityLabel={bookable ? `Time ${s}` : `Time ${s}, no longer available`}
                accessibilityState={{ selected: active, disabled: !bookable }}
                style={[
                  styles.slot,
                  {
                    backgroundColor: active ? theme.brand : theme.surfaceSunken,
                    borderColor: active ? theme.brand : theme.border,
                    opacity: bookable ? 1 : 0.4,
                  },
                ]}>
                <ThemedText
                  type="callout"
                  style={{ color: active ? theme.onBrand : bookable ? theme.text : theme.textTertiary }}>
                  {s}
                </ThemedText>
              </PressableScale>
            );
          })}
        </View>
      </FadeIn>

      <FadeIn delay={240}>
        <View style={styles.summary}>
          {slot ? (
            <Badge label={`${center?.name} · ${slot}`} tone="brand" />
          ) : (
            <ThemedText type="footnote" color="textTertiary">
              Select a time to continue
            </ThemedText>
          )}
        </View>
        <Button label="Confirm appointment" fullWidth icon="checkmark-circle" disabled={!canConfirm} loading={bookAppointment.isPending} onPress={confirm} />
      </FadeIn>
    </ScrollView>
  );
}

/**
 * Placeholder for the form while centers, profile, donations, and appointments
 * load — center list, day strip, and time grid in their real positions so the
 * confirm bar and sections don't jump when data arrives.
 */
function BookSkeleton() {
  const theme = useTheme();
  return (
    <View style={styles.skeleton}>
      <Skeleton width={72} height={18} style={styles.skelHeading} />
      <View style={styles.stack}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.skelCenter, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Skeleton width={40} height={40} radius={Radius.md} />
            <View style={styles.centerBody}>
              <Skeleton width="70%" height={15} />
              <Skeleton width="45%" height={12} />
            </View>
          </View>
        ))}
      </View>
      <Skeleton width={110} height={18} style={styles.skelHeading} />
      <View style={styles.dayRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width={60} height={64} radius={Radius.md} />
        ))}
      </View>
      <Skeleton width={56} height={18} style={styles.skelHeading} />
      <View style={styles.slotGrid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} width={88} height={44} radius={Radius.md} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.base },
  skeleton: { gap: Spacing.base },
  skelHeading: { marginTop: Spacing.sm },
  skelCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.base,
  },
  section: { marginTop: Spacing.sm },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  noticeRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  noticeBody: { flex: 1, gap: 2 },
  noticeFoot: { textAlign: 'center' },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  stack: { gap: Spacing.sm },
  centerCard: {},
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  centerIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  centerBody: { flex: 1, gap: 2 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    gap: 4,
  },
  typeHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  dayRow: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  day: {
    width: 60,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  slot: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    minWidth: 88,
    alignItems: 'center',
  },
  summary: { alignItems: 'center', marginVertical: Spacing.md, minHeight: 24, justifyContent: 'center' },
});
