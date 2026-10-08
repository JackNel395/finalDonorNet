/**
 * Home dashboard. Personal greeting, eligibility ring, blood type, quick
 * actions, nearby emergencies, appointments, centers, announcements.
 * The centerpiece screen — see design.md §Home.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EnableLocationCard } from '@/components/enable-location-card';
import { EnablePushCard } from '@/components/enable-push-card';
import { RequestCard } from '@/components/request-card';
import { ThemedText } from '@/components/themed-text';
import {
  Avatar,
  Badge,
  BloodTypeGlyph,
  Card,
  FadeIn,
  ProgressRing,
  SectionHeader,
} from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing, TabBarClearance } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { canDonateTo, computeEligibility, PH_DONATION_INTERVAL_DAYS, effectiveLastDonation } from '@/lib/blood';
import {
  dayOfMonth,
  distanceLabel,
  firstName,
  greeting,
  longDate,
  monthAbbrev,
  relativeTime,
  shortDate,
} from '@/lib/format';
import {
  useAnnouncements,
  useAppointments,
  useCenters,
  useDonations,
  useProfile,
  useRequests,
} from '@/hooks/api';
import { URGENCY_RANK } from '@/types/domain';

// Three honest destinations — no tile duplicates another tile's route.
const QUICK_ACTIONS = [
  { key: 'donate', label: 'Donate', caption: 'Book a visit', icon: 'water' as const, tint: 'brand' as const, href: '/book' as const },
  { key: 'request', label: 'Request', caption: 'Ask for help', icon: 'add-circle' as const, tint: 'info' as const, href: '/request/new' as const },
  { key: 'card', label: 'Donor Card', caption: 'Ready 24/7', icon: 'qr-code' as const, tint: 'success' as const, href: '/donor-card' as const },
];

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const { data: requests = [], refetch } = useRequests();
  const { data: appointments = [] } = useAppointments();
  const { data: donations = [] } = useDonations();
  const { data: centers = [] } = useCenters();
  const { data: announcements = [] } = useAnnouncements();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const eligibility = useMemo(
    () => computeEligibility(effectiveLastDonation(profile, donations)),
    [profile, donations],
  );

  // Only requests this donor can actually serve — most urgent first, nearest
  // as the tiebreak. Two cards max; the Feed tab owns the full list.
  const compatibleRequests = useMemo(() => {
    if (!profile) return [];
    return requests
      .filter(
        (r) =>
          (r.status === 'open' || r.status === 'partial') &&
          r.ownerId !== profile.id &&
          canDonateTo(profile.bloodType, r.bloodType),
      )
      .sort(
        (a, b) =>
          URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.distanceKm - b.distanceKm,
      )
      .slice(0, 2);
  }, [requests, profile]);

  const myActiveRequests = useMemo(() => {
    if (!profile) return [];
    return requests.filter(
      (r) => r.ownerId === profile.id && (r.status === 'open' || r.status === 'partial'),
    );
  }, [requests, profile]);

  const nextAppointment = useMemo(
    () =>
      appointments
        .filter((a) => a.status === 'confirmed' || a.status === 'pending')
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0],
    [appointments],
  );

  const nearestCenter = useMemo(
    () => [...centers].sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null,
    [centers],
  );
  const unitsGiven = donations.reduce((sum, d) => sum + d.units, 0);
  const lastDonation = useMemo(
    () =>
      donations
        .slice()
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))[0],
    [donations],
  );

  if (!profile) return null;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + TabBarClearance },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textTertiary} />
      }>
      {/* Greeting */}
      <FadeIn>
        <View style={styles.header}>
          <View style={styles.greetingBlock}>
            <View style={styles.brandLine}>
              <View style={[styles.brandMark, { backgroundColor: theme.brandSubtle }]}>
                <Ionicons name="water" size={13} color={theme.brand} />
              </View>
              <ThemedText type="caption" color="brand" style={styles.brandWordmark}>
                DONORNET
              </ThemedText>
            </View>
            <ThemedText type="title">{greeting()}, {firstName(profile.fullName)}</ThemedText>
          </View>
          {/* Just the avatar — the Feed tab already owns emergency requests, so a
              bell that duplicated it was noise, not signal. */}
          <PressableScale
            onPress={() => router.push('/(tabs)/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile">
            <Avatar name={profile.fullName} color={profile.avatarColor} size={44} />
          </PressableScale>
        </View>
      </FadeIn>

      {/* Eligibility hero */}
      <FadeIn delay={60}>
        <View style={[styles.hero, { backgroundColor: theme.brandDeep }]}>
          <View pointerEvents="none" style={[styles.heroOrb, { backgroundColor: theme.brandStrong }]} />
          <View pointerEvents="none" style={[styles.heroRing, { borderColor: theme.brand }]} />
          <View style={styles.heroLeft}>
            <View style={styles.heroEyebrow}>
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: eligibility.eligible ? theme.success : theme.warning },
                ]}
              />
              <ThemedText type="footnote" color="onColorSecondary">
                {eligibility.eligible ? 'Eligible to donate' : 'In your donation cycle'}
              </ThemedText>
            </View>
            <ThemedText type="title2" style={{ color: theme.onColor }}>
              {eligibility.eligible ? 'Your next good thing' : `Ready in ${eligibility.daysRemaining} days`}
            </ThemedText>
            <ThemedText type="footnote" color="onColorSecondary">
              {eligibility.eligible
                ? nextAppointment
                  ? `Your visit is booked for ${shortDate(nextAppointment.date)}.`
                  : 'Book a visit at a donation center near you.'
                : `Next eligible ${shortDate(eligibility.nextEligibleDate.toISOString())}`}
            </ThemedText>
            {eligibility.eligible ? (
              <PressableScale
                onPress={() =>
                  router.push(
                    nextAppointment
                      ? { pathname: '/appointment/[id]', params: { id: nextAppointment.id } }
                      : '/book',
                  )
                }
                haptic="medium"
                accessibilityRole="button"
                accessibilityLabel={nextAppointment ? 'View your appointment' : 'Book a donation'}
                style={[styles.heroCta, { backgroundColor: theme.brand }]}>
                <ThemedText type="subhead" style={{ color: theme.onBrand }}>
                  {nextAppointment ? 'View appointment' : 'Book a donation'}
                </ThemedText>
                <Ionicons name="arrow-forward" size={17} color={theme.onBrand} />
              </PressableScale>
            ) : (
              <PressableScale
                onPress={() => router.push('/(tabs)/donor')}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="Track your donation cycle"
                style={[styles.heroCtaGhost, { borderColor: theme.onColorFaint }]}>
                <ThemedText type="subhead" style={{ color: theme.onColor }}>Track your cycle</ThemedText>
                <Ionicons name="arrow-forward" size={17} color={theme.onColor} />
              </PressableScale>
            )}
          </View>
          <View style={styles.heroRingWrap}>
            <ProgressRing
              progress={eligibility.progress}
              size={94}
              strokeWidth={8}
              color={theme.brand}
              trackColor={theme.onColorFaint}
              accessibilityLabel={
                eligibility.eligible
                  ? 'Donation cycle complete, you are eligible'
                  : `Donation cycle ${Math.round(eligibility.progress * 100)} percent complete`
              }>
              <BloodTypeGlyph type={profile.bloodType} size="lg" onDark />
            </ProgressRing>
            <ThemedText type="caption" color="onColorTertiary">{PH_DONATION_INTERVAL_DAYS}-day cycle</ThemedText>
          </View>
        </View>
      </FadeIn>

      {/* Tier 1 — Needs you now: urgent compatible requests surfaced right under the hero */}
      {compatibleRequests.length > 0 ? (
        <FadeIn delay={120}>
          <SectionHeader
            title="People need your type"
            actionLabel="View feed"
            onAction={() => router.push('/(tabs)/feed')}
          />
          <View style={styles.stack}>
            {compatibleRequests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                viewerType={profile.bloodType}
                viewerId={profile.id}
                onPress={() => router.push({ pathname: '/request/[id]', params: { id: r.id } })}
              />
            ))}
          </View>
        </FadeIn>
      ) : null}

      {/* Your active requests — things the donor owns and needs to track */}
      {myActiveRequests.length > 0 ? (
        <FadeIn delay={160}>
          <SectionHeader title="Your requests" />
          <View style={styles.stack}>
            {myActiveRequests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                viewerType={profile.bloodType}
                viewerId={profile.id}
                onPress={() => router.push({ pathname: '/request/[id]', params: { id: r.id } })}
              />
            ))}
          </View>
        </FadeIn>
      ) : null}

      {/* Next appointment — an upcoming commitment */}
      {nextAppointment ? (
        <FadeIn delay={200}>
          <SectionHeader
            title="Your next appointment"
            actionLabel="Manage"
            onAction={() => router.push({ pathname: '/appointment/[id]', params: { id: nextAppointment.id } })}
          />
          <Card
            onPress={() => router.push({ pathname: '/appointment/[id]', params: { id: nextAppointment.id } })}
            accessibilityLabel={`Next appointment: ${nextAppointment.centerName}, ${longDate(nextAppointment.date)}, ${nextAppointment.status === 'confirmed' ? 'confirmed' : 'pending'}`}
            variant="tinted"
            tint={theme.infoSubtle}>
            <View style={styles.aptRow}>
              <View style={[styles.dateBadge, { backgroundColor: theme.surface }]}>
                <ThemedText type="caption" color="brand">{monthAbbrev(nextAppointment.date).toUpperCase()}</ThemedText>
                <ThemedText type="title2" color="brand">{dayOfMonth(nextAppointment.date)}</ThemedText>
              </View>
              <View style={styles.aptBody}>
                <ThemedText type="bodyStrong">{nextAppointment.centerName}</ThemedText>
                <ThemedText type="footnote" color="textSecondary">
                  {longDate(nextAppointment.date)}
                </ThemedText>
              </View>
              <Badge
                label={nextAppointment.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                tone={nextAppointment.status === 'confirmed' ? 'success' : 'warning'}
              />
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {/* Tier 2 — Explore: shortcuts and nearby options, separated from the urgent tier */}
      <FadeIn delay={240} style={styles.tierBreak}>
        <SectionHeader title="Make a difference" subtitle="Choose your next step" />
        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map((a) => (
            <PressableScale
              key={a.key}
              onPress={() => router.push(a.href)}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={`${a.label}. ${a.caption}`}
              style={[styles.action, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.actionIcon, { backgroundColor: theme[`${a.tint}Subtle`] }]}>
                <Ionicons name={a.icon} size={21} color={theme[a.tint]} />
              </View>
              <ThemedText type="subhead" style={styles.actionLabel} numberOfLines={1}>
                {a.label}
              </ThemedText>
              <ThemedText type="caption" color="textTertiary" numberOfLines={1}>
                {a.caption}
              </ThemedText>
            </PressableScale>
          ))}
        </View>
      </FadeIn>

      {/* Distances above are the seeded fallbacks until location is granted. */}
      <EnableLocationCard />

      {/* Blood-need push opt-in — self-hides once the permission is answered. */}
      <EnablePushCard />

      {/* Nearby center */}
      {nearestCenter ? (
        <FadeIn delay={280}>
          <SectionHeader
            title="Nearby donation center"
            {...(Platform.OS !== 'web' ? { actionLabel: 'Map', onAction: () => router.push('/map') } : {})}
          />
          <Card
            onPress={() => router.push('/book')}
            accessibilityLabel={`${nearestCenter.name}, ${distanceLabel(nearestCenter.distanceKm)} away, ${nearestCenter.openNow ? 'open now' : 'closed'}. Book a visit.`}>
            <View style={styles.centerRow}>
              <View style={[styles.aptIcon, { backgroundColor: theme.infoSubtle }]}>
                <Ionicons name="business" size={22} color={theme.info} />
              </View>
              <View style={styles.aptBody}>
                <ThemedText type="bodyStrong">{nearestCenter.name}</ThemedText>
                <ThemedText type="footnote" color="textSecondary">
                  {distanceLabel(nearestCenter.distanceKm)} · {nearestCenter.openNow ? 'Open now' : 'Closed'} · {nearestCenter.hours}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {/* Latest announcement — one card, not a feed. Home stays personal; the
          screen shouldn't compete with itself below the fold. */}
      {announcements[0] ? (
        <FadeIn delay={320}>
          <SectionHeader title="Latest update" />
          <Card variant="outline">
            <View style={styles.annRow}>
              <Badge label={announcements[0].tag} tone={announcements[0].tone} />
              <ThemedText type="caption" color="textTertiary">
                {relativeTime(announcements[0].date)}
              </ThemedText>
            </View>
            <ThemedText type="bodyStrong" style={styles.annTitle}>
              {announcements[0].title}
            </ThemedText>
            <ThemedText type="footnote" color="textSecondary" numberOfLines={2}>
              {announcements[0].body}
            </ThemedText>
          </Card>
        </FadeIn>
      ) : null}

      {/* Tier 3 — Reflection: impact lives at the bottom, a quiet coda, not a competing headline */}
      <FadeIn delay={360} style={styles.tierBreak}>
        <Card style={styles.impactCard} padding="base">
          <View style={styles.impactHeader}>
            <View style={styles.impactHeadText}>
              <ThemedText type="headline">Your impact</ThemedText>
              <ThemedText type="footnote" color="textSecondary">
                {donations.length > 0
                  ? `Your last donation was ${shortDate(lastDonation.date)}`
                  : 'Your first donation helps up to three people'}
              </ThemedText>
            </View>
            <View style={[styles.impactIcon, { backgroundColor: theme.successSubtle }]}>
              <Ionicons name="heart" size={18} color={theme.success} />
            </View>
          </View>
          {donations.length > 0 ? (
            <View style={styles.impactStats}>
              <ImpactStat value={String(donations.length)} label={donations.length === 1 ? 'donation' : 'donations'} color={theme.brand} />
              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
              <ImpactStat value={String(unitsGiven)} label={unitsGiven === 1 ? 'unit given' : 'units given'} color={theme.success} />
            </View>
          ) : null}
        </Card>
      </FadeIn>
    </ScrollView>
  );
}

function ImpactStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.impactStat}>
      <ThemedText type="title2" style={{ color }}>{value}</ThemedText>
      <ThemedText type="caption" color="textTertiary">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.base,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  // Generous separation at tier boundaries (Needs-you → Explore → Reflection):
  // base gap (16) within a tier, +base marginTop (16) at a break = 32, a clean
  // 2:1 rhythm that groups related sections and separates distinct ones.
  tierBreak: { marginTop: Spacing.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingBlock: { gap: Spacing.xs, flex: 1 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  brandMark: { width: 24, height: 24, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  brandWordmark: { letterSpacing: 1.2 },
  hero: {
    minHeight: 238,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  heroLeft: { flex: 1, gap: Spacing.sm, alignItems: 'flex-start', zIndex: 1 },
  heroOrb: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -84, top: -60, opacity: 0.24 },
  heroRing: { position: 'absolute', width: 250, height: 250, borderRadius: 125, right: -102, top: -78, borderWidth: 1, opacity: 0.34 },
  heroEyebrow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.full, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  heroCtaGhost: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  heroRingWrap: { alignItems: 'center', gap: Spacing.sm, zIndex: 1 },
  impactCard: { gap: Spacing.base },
  impactHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  impactHeadText: { flex: 1, gap: Spacing.xs },
  impactIcon: { width: 36, height: 36, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  impactStats: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  impactStat: { flex: 1, gap: Spacing.xs },
  statDivider: { width: StyleSheet.hairlineWidth, height: 34 },
  actionsRow: { flexDirection: 'row', gap: Spacing.md },
  action: {
    flex: 1,
    minHeight: 108,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: 2,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  actionLabel: { fontWeight: '600', marginTop: 'auto' },
  stack: { gap: Spacing.md },
  aptRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  aptIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadge: { width: 52, height: 58, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 0 },
  aptBody: { flex: 1, gap: 2 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  annRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  annTitle: { marginBottom: Spacing.xs },
});
