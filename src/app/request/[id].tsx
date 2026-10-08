/**
 * Emergency request detail. Full context for a single request: urgency,
 * compatibility to the viewer, hospital, distance, units/progress, contact,
 * note, and a respond action that updates the live feed. See design.md §Feed.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import {
  Avatar,
  Badge,
  BloodTypeGlyph,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  FadeIn,
  PressableScale,
  ScreenHeader,
  URGENCY_LABEL,
  URGENCY_TONE,
  useToast,
} from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  useCancelRequest,
  useConfirmResponder,
  useDonations,
  useFulfillRequest,
  useProfile,
  useRequest,
  useRespond,
} from '@/hooks/api';
import { useTheme } from '@/hooks/use-theme';
import { canDonateTo, computeEligibility, PH_DONATION_INTERVAL_DAYS, donorsFor, effectiveLastDonation } from '@/lib/blood';
import { distanceLabel, firstName, longDate, relativeTime, timeOfDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { Responder } from '@/types/domain';

export default function RequestDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: profile } = useProfile();
  const { data: donations = [] } = useDonations();
  const requestQuery = useRequest(id);
  const request = requestQuery.data;

  const respond = useRespond();
  const confirmResponder = useConfirmResponder(id);
  const cancelRequest = useCancelRequest(id);
  const fulfillRequest = useFulfillRequest(id);

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [fulfilling, setFulfilling] = useState(false);
  // The responder awaiting a confirm decision in the sheet, if any.
  const [pendingResponder, setPendingResponder] = useState<Responder | null>(null);
  // Shows the earned celebration sheet when the last needed unit is confirmed.
  const [celebrating, setCelebrating] = useState(false);

  const responded = request?.myResponse != null;
  const isOwner = !!(request && profile && request.ownerId === profile.id);
  const compatible = request && profile ? canDonateTo(profile.bloodType, request.bloodType) : false;
  const eligibility = computeEligibility(effectiveLastDonation(profile, donations));

  const respondMessage = eligibility.eligible
    ? "The requester will be notified that you're available to donate. Please only respond if you intend to donate soon."
    : "The requester will be notified that you're available to donate. " +
      `You're in your ${PH_DONATION_INTERVAL_DAYS}-day recovery window — eligible again ` +
      `${longDate(eligibility.nextEligibleDate.toISOString())} (${eligibility.daysRemaining} days). ` +
      'You can still pledge; the donation would happen after that date.';

  if (requestQuery.isLoading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + Spacing.sm }]}>
        <ScreenHeader title="Request" showBack />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + Spacing.sm }]}>
        <ScreenHeader title="Request" showBack />
        <EmptyState
          icon="alert-circle-outline"
          title="Request not found"
          subtitle="This request may have been fulfilled or expired."
        />
      </View>
    );
  }

  const fulfilled = request.unitsFulfilled / request.unitsNeeded;

  const onRespond = () => {
    respond.mutate(request.id);
    setConfirming(false);
    toast.show('Thank you. The hospital has been notified.', 'success');
  };

  const call = () => {
    void Linking.openURL(`tel:${request.contactPhone}`);
  };

  const onMarkFulfilled = () => {
    fulfillRequest.mutate();
    setFulfilling(false);
    toast.show('Request marked fulfilled. Thank you.', 'success');
  };

  // Responders who offered but haven't been confirmed — used to warn the owner
  // when they mark fulfilled while offers are still pending.
  const pendingOffers = (request.responders ?? []).filter((r) => r.status === 'offered').length;

  const onCancel = () => {
    cancelRequest.mutate();
    setCancelling(false);
    toast.show('Request cancelled.', 'success');
  };

  const onConfirmResponder = async () => {
    if (!pendingResponder) return;
    const responder = pendingResponder;
    setPendingResponder(null);
    try {
      // The server recomputes fulfillment and returns the updated request.
      const updated = await confirmResponder.mutateAsync(responder.id);
      if (updated.status === 'fulfilled') {
        // The payoff moment — the request is fully met.
        haptics.success();
        setCelebrating(true);
      } else {
        haptics.medium();
        toast.show(`${firstName(responder.fullName)} is on the way. One step closer.`, 'success');
      }
    } catch {
      haptics.error();
      toast.show('Could not confirm this donor. Please try again.', 'danger');
    }
  };

  const isClosed = request.status === 'fulfilled' || request.status === 'expired';

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
          title={request.hospital}
          showBack
          large={false}
          trailing={
            // Once closed, urgency is history; the status is what a reader needs.
            isClosed ? (
              <Badge
                label={request.status === 'fulfilled' ? 'Fulfilled' : 'Closed'}
                tone={request.status === 'fulfilled' ? 'success' : 'neutral'}
              />
            ) : (
              <Badge label={URGENCY_LABEL[request.urgency]} tone={URGENCY_TONE[request.urgency]} dot />
            )
          }
        />

        {/* Blood type + compatibility */}
        <FadeIn>
          <Card style={styles.hero}>
            <BloodTypeGlyph type={request.bloodType} size="lg" filled />
            <View style={styles.heroText}>
              <ThemedText type="title2">{request.bloodType} needed</ThemedText>
              <ThemedText type="subhead" color="textSecondary">
                {request.unitsNeeded} unit{request.unitsNeeded > 1 ? 's' : ''} · patient {request.patientInitials}
              </ThemedText>
              {isOwner ? (
                <View style={styles.compatRow}>
                  <Ionicons name="person-circle" size={16} color={theme.brand} />
                  <ThemedText type="footnote" color="brand">
                    Your request
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </Card>
        </FadeIn>

        {/* Compatibility — explicit for the viewer; hidden for owners and when
            the profile hasn't loaded. */}
        {!isOwner && profile && !isClosed ? (
          <FadeIn delay={30}>
            <Card variant="tinted" tint={compatible ? theme.successSubtle : theme.warningSubtle}>
              <View style={styles.compatCard}>
                <Ionicons
                  name={compatible ? 'checkmark-circle' : 'alert-circle'}
                  size={20}
                  color={compatible ? theme.success : theme.warning}
                />
                <View style={styles.compatCardText}>
                  <ThemedText type="footnote" color="textSecondary">
                    {compatible
                      ? `Your ${profile.bloodType} is compatible with this request.`
                      : `Your ${profile.bloodType} can't donate to ${request.bloodType}. ` +
                        `${request.bloodType} patients can only receive from: ${donorsFor(request.bloodType).join(', ')}.`}
                  </ThemedText>
                  {/* The incompatible case is where donors doubt the matching;
                      give them the full chart rather than only a verdict. */}
                  {!compatible ? (
                    <PressableScale
                      onPress={() => router.push('/blood-compatibility')}
                      hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                      accessibilityRole="button"
                      accessibilityLabel="See the full blood type compatibility chart">
                      <ThemedText type="footnote" color="brand" style={styles.compatLink}>
                        See the full chart
                      </ThemedText>
                    </PressableScale>
                  ) : null}
                </View>
              </View>
            </Card>
          </FadeIn>
        ) : null}

        {/* Progress */}
        <FadeIn delay={60}>
          <Card>
            <View style={styles.progressHead}>
              <ThemedText type="subhead" color="textSecondary">
                Fulfillment
              </ThemedText>
              <ThemedText type="subhead">
                {request.unitsFulfilled}/{request.unitsNeeded} units
              </ThemedText>
            </View>
            <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
              <View
                style={[styles.fill, { width: `${Math.min(100, fulfilled * 100)}%`, backgroundColor: theme.brand }]}
              />
            </View>
            <ThemedText type="footnote" color="textTertiary" style={styles.responders}>
              {request.respondersCount} donor{request.respondersCount === 1 ? '' : 's'} responding
            </ThemedText>
          </Card>
        </FadeIn>

        {/* Responders — owner only. Review and confirm donors who offered. */}
        {isOwner ? (
          <FadeIn delay={90}>
            <View style={styles.sectionHead}>
              <ThemedText type="headline">Responders</ThemedText>
              {request.responders && request.responders.length > 0 ? (
                <ThemedText type="footnote" color="textSecondary">
                  Confirm the donors you want to proceed with
                </ThemedText>
              ) : null}
            </View>
            {request.responders && request.responders.length > 0 ? (
              <Card padding="base">
                {request.responders.map((r, i) => (
                  <View
                    key={r.id}
                    style={[
                      styles.responderRow,
                      i < request.responders!.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.border,
                      },
                    ]}>
                    <Avatar name={r.fullName} color={r.avatarColor} size={40} />
                    <View style={styles.responderInfo}>
                      <ThemedText type="bodyStrong" numberOfLines={1}>
                        {r.fullName}
                      </ThemedText>
                      <ThemedText type="caption" color="textSecondary" numberOfLines={1}>
                        {r.bloodType} · {distanceLabel(r.distanceKm)} · {relativeTime(r.respondedAt)}
                      </ThemedText>
                    </View>
                    {r.status === 'confirmed' ? (
                      <Badge label="Confirmed" tone="success" dot />
                    ) : isClosed ? (
                      <Badge label="Offered" tone="neutral" />
                    ) : (
                      <Button
                        label="Confirm"
                        size="sm"
                        icon="checkmark"
                        onPress={() => setPendingResponder(r)}
                      />
                    )}
                  </View>
                ))}
              </Card>
            ) : (
              <Card variant="tinted" tint={theme.surfaceSunken}>
                <View style={styles.emptyResponders}>
                  <Ionicons name="people-outline" size={22} color={theme.textTertiary} />
                  <ThemedText type="footnote" color="textSecondary" style={styles.emptyRespondersText}>
                    No responders yet. Donors will appear here as they offer to help.
                  </ThemedText>
                </View>
              </Card>
            )}
          </FadeIn>
        ) : null}

        {/* Details */}
        <FadeIn delay={120}>
          <Card padding="base">
            <DetailRow icon="location-outline" label="Location" value={`${request.city} · ${distanceLabel(request.distanceKm)}`} />
            <DetailRow icon="time-outline" label="Needed by" value={`${longDate(request.neededBy)}, ${timeOfDay(request.neededBy)}`} />
            <DetailRow icon="hourglass-outline" label="Posted" value={relativeTime(request.postedAt)} />
            <DetailRow icon="person-outline" label="Contact" value={request.contactName} last />
          </Card>
        </FadeIn>

        {/* Note */}
        {request.note ? (
          <FadeIn delay={180}>
            <Card variant="tinted" tint={theme.surfaceSunken}>
              <ThemedText type="subhead" color="textSecondary" style={styles.noteLabel}>
                Additional notes
              </ThemedText>
              <ThemedText type="body">{request.note}</ThemedText>
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
        <View style={styles.actionRow}>
        {isOwner ? (
          isClosed ? (
            <View style={styles.respondBtn}>
              <Button
                label={request.status === 'fulfilled' ? 'Fulfilled' : 'Cancelled'}
                fullWidth
                disabled
                icon={request.status === 'fulfilled' ? 'checkmark' : 'close'}
              />
            </View>
          ) : (
            <>
              <Button label="Cancel request" variant="secondary" icon="close" onPress={() => setCancelling(true)} />
              <View style={styles.respondBtn}>
                <Button label="Mark fulfilled" fullWidth icon="checkmark" onPress={() => setFulfilling(true)} />
              </View>
            </>
          )
        ) : (
          <>
            <Button label="Call" variant="secondary" icon="call" onPress={call} />
            <View style={styles.respondBtn}>
              <Button
                label={
                  responded
                    ? 'You responded'
                    : isClosed
                      ? request.status === 'fulfilled'
                        ? 'Request fulfilled'
                        : 'Request closed'
                      : compatible
                        ? 'Respond to request'
                        : 'Respond anyway'
                }
                fullWidth
                disabled={responded || isClosed}
                icon={responded || request.status === 'fulfilled' ? 'checkmark' : isClosed ? 'time-outline' : 'hand-left'}
                onPress={() => setConfirming(true)}
              />
            </View>
          </>
        )}
        </View>
        {!isOwner && !responded && isClosed ? (
          // Says why the button is disabled, rather than leaving it to look broken.
          <ThemedText type="caption" color="textTertiary" style={styles.actionHint}>
            {request.status === 'fulfilled'
              ? 'Every unit has a donor. Thank you for checking.'
              : 'This request passed its needed-by time and no longer takes donors.'}
          </ThemedText>
        ) : null}
        {!isOwner && !responded && !isClosed && !eligibility.eligible ? (
          <ThemedText type="caption" color="textTertiary" style={styles.actionHint}>
            Recovering · ready in {eligibility.daysRemaining} days
          </ThemedText>
        ) : null}
      </View>

      <ConfirmSheet
        visible={confirming}
        title="Respond to this request?"
        message={respondMessage}
        confirmLabel="Yes, I can donate"
        cancelLabel="Not now"
        onConfirm={onRespond}
        onCancel={() => setConfirming(false)}
      />

      <ConfirmSheet
        visible={cancelling}
        title="Cancel this request?"
        message="Donors will no longer see it in the emergency feed. This can't be undone."
        confirmLabel="Cancel request"
        cancelLabel="Keep it active"
        destructive
        onConfirm={onCancel}
        onCancel={() => setCancelling(false)}
      />

      <ConfirmSheet
        visible={!!pendingResponder}
        title={pendingResponder ? `Confirm ${firstName(pendingResponder.fullName)} as a donor?` : ''}
        message="They'll be notified that you've accepted their offer to donate."
        confirmLabel="Confirm donor"
        cancelLabel="Not yet"
        onConfirm={onConfirmResponder}
        onCancel={() => setPendingResponder(null)}
      />

      <ConfirmSheet
        visible={celebrating}
        title="Your request is fulfilled"
        message="Every unit you need has a confirmed donor on the way. Thank you for trusting DonorNet."
        confirmLabel="Done"
        cancelLabel="Close"
        onConfirm={() => setCelebrating(false)}
        onCancel={() => setCelebrating(false)}
      />

      <ConfirmSheet
        visible={fulfilling}
        title="Mark this request fulfilled?"
        message={
          pendingOffers > 0
            ? `You still have ${pendingOffers} donor${pendingOffers === 1 ? '' : 's'} waiting to be confirmed. Marking this fulfilled closes the request and leaves those offers unconfirmed.`
            : 'This closes the request and removes it from the emergency feed.'
        }
        confirmLabel="Mark fulfilled"
        cancelLabel="Keep it open"
        onConfirm={onMarkFulfilled}
        onCancel={() => setFulfilling(false)}
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
  heroText: { flex: 1, gap: 4 },
  compatRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  compatCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  compatCardText: { flex: 1, gap: Spacing.sm },
  compatLink: { fontWeight: '700' },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  responders: { marginTop: Spacing.sm },
  sectionHead: { gap: 2, marginBottom: Spacing.sm },
  responderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  responderInfo: { flex: 1, gap: 2 },
  emptyResponders: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  emptyRespondersText: { flex: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  detailIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  detailLabel: { width: 88 },
  detailValue: { flex: 1, textAlign: 'right' },
  noteLabel: { marginBottom: Spacing.xs },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionHint: { textAlign: 'center', marginTop: Spacing.xs },
  respondBtn: { flex: 1 },
});
