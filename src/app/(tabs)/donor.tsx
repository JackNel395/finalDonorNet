/**
 * Donor dashboard. Eligibility, lifetime impact, donation history timeline,
 * achievements, health reminders, and the digital donor card entry point.
 * See design.md §Donor.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EnablePushCard } from '@/components/enable-push-card';
import { ThemedText } from '@/components/themed-text';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FadeIn,
  ProgressRing,
  ScreenHeader,
  Skeleton,
  StatTile,
} from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing, TabBarClearance } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { computeAchievements } from '@/data/achievements';
import { useAppointments, useDonations, useProfile, useRequests } from '@/hooks/api';
import { computeEligibility, effectiveLastDonation } from '@/lib/blood';
import { upcomingAppointment } from '@/lib/booking';
import { longDate, shortDate, timeOfDay } from '@/lib/format';

export default function DonorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profileQuery = useProfile();
  const donationsQuery = useDonations();
  const { data: requests = [] } = useRequests();
  const appointmentsQuery = useAppointments();

  const profile = profileQuery.data;
  // Stable references so the memos below don't rerun on every render.
  const donations = useMemo(() => donationsQuery.data ?? [], [donationsQuery.data]);
  const appointments = useMemo(() => appointmentsQuery.data ?? [], [appointmentsQuery.data]);

  const eligibility = useMemo(
    () => computeEligibility(effectiveLastDonation(profile, donations)),
    [profile, donations],
  );
  const upcoming = useMemo(() => upcomingAppointment(appointments), [appointments]);

  const totalUnits = donations.reduce((sum, d) => sum + d.units, 0);
  const livesImpacted = totalUnits * 3;
  const achievements = useMemo(
    () =>
      computeAchievements({
        donationCount: donations.length,
        hasResponded: requests.some((r) => r.myResponse),
      }),
    [donations.length, requests],
  );

  const eligibilityNote = upcoming
    ? `Your next visit is ${shortDate(upcoming.date)}.`
    : eligibility.eligible
      ? 'Book an appointment whenever it suits you.'
      : `Next eligible ${longDate(eligibility.nextEligibleDate.toISOString())}`;

  const header = (
    <ScreenHeader
      title="Donor"
      subtitle="Your eligibility, history, and impact"
      trailing={
        <PressableScale
          onPress={() => router.push('/donor-card')}
          accessibilityLabel="Open donor card"
          style={[styles.cardBtn, { backgroundColor: theme.brandSubtle }]}>
          <Ionicons name="qr-code-outline" size={20} color={theme.brand} />
        </PressableScale>
      }
    />
  );

  // On a real device each of these is a ~1s round-trip, so defaulting to `[]`
  // would flash a false "No donations yet" and the wrong eligibility before the
  // data lands. Hold on a skeleton until the screen's own data is present.
  // See memory: web preview hides native latency.
  if (profileQuery.isPending || donationsQuery.isPending || appointmentsQuery.isPending) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + TabBarClearance },
        ]}
        showsVerticalScrollIndicator={false}>
        {header}
        <DonorSkeleton />
      </ScrollView>
    );
  }

  // Loaded, but no profile — the session gate routes 404s to setup, so this is
  // only reached on a hard error. Nothing sensible to show without a profile.
  if (!profile) return null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + TabBarClearance },
      ]}
      showsVerticalScrollIndicator={false}>
      {header}

      {/* Digital donor card teaser */}
      <FadeIn>
        <PressableScale scaleTo={0.985} onPress={() => router.push('/donor-card')}>
          <View style={[styles.donorCard, { backgroundColor: theme.brandDeep }]}>
            <View style={styles.donorCardTop}>
              <View>
                <ThemedText type="footnote" style={styles.cardLabel}>
                  BLOOD BRIDGE DONOR
                </ThemedText>
                <ThemedText type="title2" style={styles.cardName}>
                  {profile.fullName}
                </ThemedText>
              </View>
              <View style={[styles.cardType, { backgroundColor: theme.brand }]}>
                <ThemedText type="title" style={[styles.cardTypeText, { color: theme.onBrand }]}>
                  {profile.bloodType}
                </ThemedText>
              </View>
            </View>
            <View style={styles.donorCardBottom}>
              <ThemedText type="footnote" style={styles.cardLabel}>
                Tap to open your verifiable card
              </ThemedText>
              <Ionicons name="qr-code" size={22} color="#FFFFFF" />
            </View>
          </View>
        </PressableScale>
      </FadeIn>

      {/* Eligibility */}
      <FadeIn delay={60}>
        <Card>
          <View style={styles.eligRow}>
            <ProgressRing
              progress={eligibility.progress}
              size={84}
              color={eligibility.eligible ? theme.success : theme.brand}>
              <Ionicons
                name={eligibility.eligible ? 'checkmark' : 'time-outline'}
                size={26}
                color={eligibility.eligible ? theme.success : theme.brand}
              />
            </ProgressRing>
            <View style={styles.eligText}>
              <Badge
                label={eligibility.eligible ? 'Eligible' : 'Recovering'}
                tone={eligibility.eligible ? 'success' : 'warning'}
                dot
              />
              <ThemedText type="title2">
                {eligibility.eligible ? "You're ready to donate" : `${eligibility.daysRemaining} days to go`}
              </ThemedText>
              <ThemedText type="subhead" color="textSecondary">
                {eligibilityNote}
              </ThemedText>
            </View>
          </View>
          {/* An upcoming visit outranks the booking CTA: one appointment at a
              time, so point at the one they have instead of offering another. */}
          {upcoming ? (
            <PressableScale
              onPress={() => router.push(`/appointment/${upcoming.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`View your appointment at ${upcoming.centerName} on ${longDate(upcoming.date)}`}
              style={[styles.upcoming, { backgroundColor: theme.infoSubtle }]}>
              <Ionicons name="calendar" size={18} color={theme.info} />
              <View style={styles.upcomingBody}>
                <ThemedText type="subhead">Visit booked</ThemedText>
                <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
                  {upcoming.centerName} · {timeOfDay(upcoming.date)}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </PressableScale>
          ) : eligibility.eligible ? (
            <Button
              label="Book a donation"
              icon="calendar-outline"
              fullWidth
              onPress={() => router.push('/book')}
              style={styles.eligBtn}
            />
          ) : null}
        </Card>
      </FadeIn>

      <EnablePushCard />

      {/* Impact stats */}
      <FadeIn delay={120}>
        <View style={styles.statRow}>
          <StatTile label="Donations" value={String(donations.length)} icon="water" tint="brand" />
          <StatTile label="Units given" value={String(totalUnits)} icon="fitness" tint="info" />
          <StatTile label="Lives helped" value={String(livesImpacted)} icon="heart" tint="success" />
        </View>
      </FadeIn>

      {/* Achievements */}
      <FadeIn delay={160}>
        <View style={styles.sectionHead}>
          <ThemedText type="headline">Achievements</ThemedText>
          <ThemedText type="footnote" color="textTertiary">
            {achievements.filter((a) => a.unlocked).length}/{achievements.length}
          </ThemedText>
        </View>
        <View style={styles.achGrid}>
          {achievements.map((a) => (
            <View key={a.id} style={styles.achWrap}>
              <Card padding="base" style={[styles.achCard, { opacity: a.unlocked ? 1 : 0.55 }]}>
                <View
                  style={[
                    styles.achIcon,
                    { backgroundColor: a.unlocked ? theme.brandSubtle : theme.surfaceSunken },
                  ]}>
                  <Ionicons
                    name={(a.icon as keyof typeof Ionicons.glyphMap) ?? 'ribbon'}
                    size={20}
                    color={a.unlocked ? theme.brand : theme.textTertiary}
                  />
                </View>
                <ThemedText type="subhead" numberOfLines={1}>
                  {a.title}
                </ThemedText>
                <ThemedText type="footnote" color="textSecondary" numberOfLines={2}>
                  {a.description}
                </ThemedText>
                {!a.unlocked && a.progress != null ? (
                  <View style={[styles.achTrack, { backgroundColor: theme.surfaceSunken }]}>
                    <View
                      style={[
                        styles.achFill,
                        { width: `${Math.round(a.progress * 100)}%`, backgroundColor: theme.brand },
                      ]}
                    />
                  </View>
                ) : null}
              </Card>
            </View>
          ))}
        </View>
      </FadeIn>

      {/* Donation history */}
      <FadeIn delay={200}>
        <View style={styles.sectionHead}>
          <ThemedText type="headline">Donation history</ThemedText>
        </View>
        {donations.length === 0 ? (
          <Card>
            <EmptyState
              icon="water-outline"
              title="No donations yet"
              subtitle="Your donation history will appear here after your first visit."
            />
          </Card>
        ) : (
          <Card padding="base">
            {donations.map((d, i) => (
              <View key={d.id} style={styles.histRow}>
                <View style={styles.histLeft}>
                  <View style={[styles.histDot, { backgroundColor: theme.brand }]} />
                  {i < donations.length - 1 ? (
                    <View style={[styles.histLine, { backgroundColor: theme.border }]} />
                  ) : null}
                </View>
                <View style={styles.histBody}>
                  <View style={styles.histTop}>
                    <ThemedText type="subhead">{d.centerName}</ThemedText>
                    <ThemedText type="footnote" color="textTertiary">
                      {shortDate(d.date)}
                    </ThemedText>
                  </View>
                  <ThemedText type="footnote" color="textSecondary">
                    {d.units} unit{d.units > 1 ? 's' : ''} · {d.type.replace('_', ' ')} · {d.city}
                  </ThemedText>
                </View>
              </View>
            ))}
          </Card>
        )}
      </FadeIn>
    </ScrollView>
  );
}

/**
 * Placeholder that mirrors the loaded layout — donor card, eligibility, stats,
 * achievements — so content lands in place instead of shifting the page. Not
 * wrapped in FadeIn: a shimmering block that then fades reads as a double
 * animation on device.
 */
function DonorSkeleton() {
  const theme = useTheme();
  return (
    <View style={styles.skeleton}>
      <Skeleton height={150} radius={Radius['2xl']} />
      <View style={[styles.skelCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.skelEligRow}>
          <Skeleton width={84} height={84} radius={Radius.full} />
          <View style={styles.skelEligText}>
            <Skeleton width={96} height={22} radius={Radius.full} />
            <Skeleton width="80%" height={18} />
            <Skeleton width="60%" height={14} />
          </View>
        </View>
      </View>
      <View style={styles.statRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.skelStat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Skeleton width={36} height={36} radius={Radius.md} />
            <Skeleton width="70%" height={20} />
            <Skeleton width="50%" height={12} />
          </View>
        ))}
      </View>
      <View style={styles.achGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.achWrap}>
            <View style={[styles.skelAch, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Skeleton width={40} height={40} radius={Radius.md} />
              <Skeleton width="80%" height={14} />
              <Skeleton width="95%" height={12} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.base, gap: Spacing.lg },
  skeleton: { gap: Spacing.lg },
  skelCard: { borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.lg },
  skelEligRow: { flexDirection: 'row', gap: Spacing.base, alignItems: 'center' },
  skelEligText: { flex: 1, gap: Spacing.sm },
  skelStat: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  skelAch: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.base,
    gap: Spacing.sm,
    minHeight: 132,
  },
  cardBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donorCard: {
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    gap: Spacing['2xl'],
    minHeight: 150,
    justifyContent: 'space-between',
  },
  donorCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel: { color: 'rgba(255,255,255,0.8)', letterSpacing: 1, fontWeight: '600' },
  cardName: { color: '#FFFFFF', marginTop: 2 },
  cardType: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  cardTypeText: {},
  donorCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eligRow: { flexDirection: 'row', gap: Spacing.base, alignItems: 'center' },
  eligText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  eligBtn: { marginTop: Spacing.base },
  upcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.base,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  upcomingBody: { flex: 1, gap: 2 },
  statRow: { flexDirection: 'row', gap: Spacing.md },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, alignItems: 'stretch' },
  achWrap: { width: '47.5%', flexGrow: 1, alignSelf: 'stretch' },
  achCard: { gap: 6, minHeight: 132, flex: 1 },
  achIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  achTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: Spacing.xs },
  achFill: { height: '100%', borderRadius: 3 },
  histRow: { flexDirection: 'row', gap: Spacing.md },
  histLeft: { alignItems: 'center', width: 12 },
  histDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  histLine: { width: 2, flex: 1, marginVertical: 4 },
  histBody: { flex: 1, paddingBottom: Spacing.lg, gap: 2 },
  histTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
