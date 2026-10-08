/**
 * /admin/users/[id] — one account, its history, and the actions staff can take
 * on it.
 *
 * Three of those actions are consequential in different ways, and the copy is
 * specific about each:
 *
 *   - Correcting the last-donation date moves the donor's eligibility
 *     countdown. Too early and a willing donor is blocked for months; too late
 *     and they are invited back before the interval has elapsed.
 *   - Suspending signs the donor out immediately and refuses them at sign-in.
 *   - Deleting cascades through their donations, appointments, and responses,
 *     and cannot be undone.
 *
 * The screen is a two-column dossier rather than a single scrolling stack. The
 * stack made an operator page past three empty tables to reach the controls
 * they opened the account for; here the countdown, the facts, and the actions
 * are all reachable without scrolling past history that is usually empty, and
 * the three history tables share one tabbed panel because they answer the same
 * question — what has this donor done.
 *
 * Detail is a route, not a modal, and confirmations are `ConfirmPanel` — the
 * design system forbids an invented centered web modal.
 *
 * Web-only; see user-detail.native.tsx.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ConfirmPanel } from '@/components/admin/confirm-panel';
import { DropMark } from '@/components/admin/marks';
import { STATUS_LABEL, STATUS_TONE } from '@/components/admin/request-status';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ThemedText } from '@/components/themed-text';
import {
  Badge,
  BloodTypeGlyph,
  Button,
  Card,
  EmptyState,
  Input,
  Skeleton,
  URGENCY_LABEL,
  URGENCY_TONE,
  useToast,
} from '@/components/ui';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useAdminUser, useDonorStatus, useUpdateDonor } from '@/hooks/api/admin/use-admin-users';
import { useTheme } from '@/hooks/use-theme';
import { computeEligibility, effectiveLastDonation, PH_DONATION_INTERVAL_DAYS } from '@/lib/blood';
import { DONATION_TYPE_LABEL } from '@/lib/booking';
import { dateWithYear, longDate, relativeTime, shortDate, timeOfDay } from '@/lib/format';
import type {
  AdminDonorDetail,
  AdminDonorDevice,
  AdminDonorResponse,
  AuditEntry,
  DonorStatusAction,
} from '@/types/api';
import type { Appointment, BloodType, Donation } from '@/types/domain';

/** Audit actions read back as sentences rather than dotted verbs. */
const AUDIT_LABEL: Record<string, string> = {
  'user.suspend': 'Suspended',
  'user.reactivate': 'Reactivated',
  'user.delete': 'Deleted',
  'user.update_last_donation': 'Corrected last donation',
};

const APPOINTMENT_TONE = {
  confirmed: 'success',
  pending: 'info',
  completed: 'brand',
  cancelled: 'neutral',
} as const;

const APPOINTMENT_LABEL: Record<Appointment['status'], string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

type ActivityTab = 'donations' | 'appointments' | 'responses';

export function AdminUserDetailScreen() {
  return <AdminGate>{() => <Detail />}</AdminGate>;
}

function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const query = useAdminUser(id);
  const updateDonor = useUpdateDonor(id);
  const status = useDonorStatus(id);

  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [donationDate, setDonationDate] = useState('');
  const [dateError, setDateError] = useState<string | undefined>();
  const [tab, setTab] = useState<ActivityTab>('donations');
  // The destructive action awaiting confirmation, if any.
  const [pending, setPending] = useState<DonorStatusAction | null>(null);

  if (query.isPending) {
    return (
      <AdminShell nav="users" title="Donor" showTitle={false}>
        <Skeleton height={44} radius={Radius.md} />
        <Skeleton height={190} radius={Radius.xl} />
        <Skeleton height={96} radius={Radius.lg} />
        <Skeleton height={320} radius={Radius.lg} />
      </AdminShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AdminShell nav="users" title="Donor" showTitle={false}>
        <Breadcrumb name="Donor" onBack={() => router.back()} />
        <Card padding={0}>
          <EmptyState
            icon="alert-circle-outline"
            title="Could not open this account"
            subtitle="It may have been removed, or the console could not reach the server. Nothing has changed."
            actionLabel="Try again"
            onAction={() => void query.refetch()}
          />
        </Card>
      </AdminShell>
    );
  }

  const donor = query.data;
  const busy = status.isPending || updateDonor.isPending;

  const runStatus = (action: DonorStatusAction) => {
    const trimmed = reason.trim();
    if ((action === 'suspend' || action === 'delete') && !trimmed) {
      setReasonError(
        action === 'suspend'
          ? 'A reason is required to suspend an account.'
          : 'A reason is required to delete an account.',
      );
      return;
    }
    setReasonError(undefined);
    status.mutate(
      { action, reason: trimmed || undefined },
      {
        onSuccess: () => {
          setReason('');
          if (action === 'delete') {
            toast.show(`${donor.fullName}'s account was deleted.`, 'warning');
            // Nothing left to show here.
            router.replace('/admin/users');
            return;
          }
          toast.show(
            action === 'suspend'
              ? `${donor.fullName} is suspended and has been signed out.`
              : `${donor.fullName} can sign in again.`,
            action === 'suspend' ? 'warning' : 'success',
          );
        },
        // The server's message is the specific one — a 409 explains which
        // transition no longer applies.
        onError: (err) => toast.show(err.message, 'danger'),
      },
    );
  };

  const saveDonationDate = (clear: boolean) => {
    if (clear) {
      setDateError(undefined);
      updateDonor.mutate(
        { lastDonationDate: null, reason: reason.trim() || undefined },
        {
          onSuccess: () => toast.show('Last-donation date cleared.', 'success'),
          onError: (err) => toast.show(err.message, 'danger'),
        },
      );
      return;
    }

    const trimmed = donationDate.trim();
    if (!trimmed) {
      setDateError('Enter a date as YYYY-MM-DD.');
      return;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      setDateError('That is not a date the console can read. Use YYYY-MM-DD.');
      return;
    }
    // Checked here too so the operator is told before a round trip; the server
    // is still the authority and refuses it independently.
    if (parsed.getTime() > Date.now()) {
      setDateError('A last-donation date cannot be in the future.');
      return;
    }
    setDateError(undefined);
    updateDonor.mutate(
      { lastDonationDate: parsed.toISOString(), reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          setDonationDate('');
          toast.show('Last-donation date corrected.', 'success');
        },
        onError: (err) => toast.show(err.message, 'danger'),
      },
    );
  };

  /** ConfirmPanel has no busy state, so callers close first, then mutate. */
  const confirm = () => {
    const action = pending;
    setPending(null);
    if (action) runStatus(action);
  };

  // The same date the donor app counts from: the profile's stored date when
  // there is one, otherwise the newest donation on file. Reading only the
  // stored date would contradict the "falls back to the newest donation" copy
  // in the Last donation card below.
  const countFrom = effectiveLastDonation(donor, donor.donations);
  const eligibility = computeEligibility(countFrom);

  return (
    <AdminShell nav="users" title={donor.fullName} subtitle={donor.email} showTitle={false}>
      <Breadcrumb name={donor.fullName} onBack={() => router.back()} />

      {donor.banned ? (
        <Notice
          tone="danger"
          icon="lock-closed-outline"
          title="This account is suspended"
          body={`${donor.banReason ?? 'No reason was recorded.'}${
            donor.banExpires ? ` The suspension lifts on ${longDate(donor.banExpires)}.` : ''
          }`}
        />
      ) : null}

      {!donor.hasProfile ? (
        <Notice
          tone="warning"
          icon="alert-circle-outline"
          title="This signup never finished onboarding"
          body="There is no donor profile, so no blood type, city, or donation history — and this account is not matched to any request."
        />
      ) : null}

      <DonorHero donor={donor} eligibility={eligibility} countFrom={countFrom} />

      <View style={styles.tiles}>
        <MiniStat
          icon="water-outline"
          tint="brand"
          value={String(donor.donations.length)}
          label="Donations"
        />
        <MiniStat
          icon="people-outline"
          tint="info"
          value={String(donor.responses.length)}
          label="Request responses"
        />
        <MiniStat
          icon="phone-portrait-outline"
          tint="neutral"
          value={String(donor.deviceCount)}
          label="Devices"
        />
        <MiniStat
          icon="time-outline"
          tint={eligibility.eligible ? 'success' : 'warning'}
          value={eligibility.eligible ? 'Now' : String(eligibility.daysRemaining)}
          label={eligibility.eligible ? 'Eligible' : 'Days to go'}
        />
      </View>

      <View style={styles.columns}>
        <View style={styles.columnMain}>
          <Panel
            title="Activity"
            subtitle="Donations, bookings and emergency offers from this donor.">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'donations', label: 'Donation history', count: donor.donations.length },
                { key: 'appointments', label: 'Appointments', count: donor.appointments.length },
                { key: 'responses', label: 'Request responses', count: donor.responses.length },
              ]}
            />
            {tab === 'donations' ? <Donations rows={donor.donations} /> : null}
            {tab === 'appointments' ? <Appointments rows={donor.appointments} /> : null}
            {tab === 'responses' ? <Responses rows={donor.responses} /> : null}
          </Panel>

          <View style={styles.columnSplit}>
            <View style={styles.half}>
              <Panel
                title="Devices"
                subtitle="Where an emergency push to this donor would land. Push tokens themselves are never shown.">
                <Devices rows={donor.devices} />
              </Panel>
            </View>
            <View style={styles.half}>
              <Panel title="Audit trail" subtitle="Every staff action taken on this account.">
                <AuditTrail rows={donor.auditTrail} />
              </Panel>
            </View>
          </View>
        </View>

        <View style={styles.columnSide}>
          <Panel title="Donor details">
            <DonorFacts donor={donor} />
          </Panel>

          <Panel
            title="Last donation"
            subtitle="Drives the donor's donation-interval countdown. Correct it only from a record of a real donation. It is not a medical judgement.">
            <LastDonationForm
              donor={donor}
              value={donationDate}
              error={dateError}
              busy={busy}
              saving={updateDonor.isPending}
              onChange={(v) => {
                setDonationDate(v);
                if (dateError) setDateError(undefined);
              }}
              onSave={() => saveDonationDate(false)}
              onClear={() => saveDonationDate(true)}
            />
          </Panel>
        </View>
      </View>

      <AccountActions
        donor={donor}
        reason={reason}
        reasonError={reasonError}
        busy={busy}
        reactivating={status.isPending}
        onReason={(v) => {
          setReason(v);
          if (reasonError) setReasonError(undefined);
        }}
        onReactivate={() => runStatus('reactivate')}
        onSuspend={() => setPending('suspend')}
        onDelete={() => setPending('delete')}
      />

      <ConfirmPanel
        visible={pending === 'suspend'}
        destructive
        title={`Suspend ${donor.fullName}?`}
        message={`They are signed out of all ${donor.deviceCount || 'their'} device${donor.deviceCount === 1 ? '' : 's'} straight away and cannot sign back in until you reactivate the account. Their donation history and appointments are kept.`}
        confirmLabel="Suspend"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmPanel
        visible={pending === 'delete'}
        destructive
        title={`Delete ${donor.fullName}'s account?`}
        message={`Their profile, ${donor.donations.length} donation record${donor.donations.length === 1 ? '' : 's'}, ${donor.appointments.length} appointment${donor.appointments.length === 1 ? '' : 's'}, and every request response are removed permanently and cannot be restored. The record of this deletion, and your reason, is kept.`}
        confirmLabel="Delete permanently"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </AdminShell>
  );
}

/** Where this account sits, and the way back to the list it came from. */
function Breadcrumb({ name, onBack }: { name: string; onBack: () => void }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={styles.crumbs}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ hovered, pressed }) => [
          styles.backButton,
          { borderColor: theme.border, backgroundColor: theme.surface },
          hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
        ]}>
        <Ionicons name="chevron-back" size={18} color={theme.text} />
      </Pressable>
      <Pressable
        onPress={() => router.replace('/admin/users')}
        accessibilityRole="link"
        accessibilityLabel="Back to all donors"
        hitSlop={8}>
        {({ hovered }) => (
          <ThemedText type="subhead" color={hovered ? 'text' : 'textSecondary'}>
            Donors
          </ThemedText>
        )}
      </Pressable>
      <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
      <ThemedText type="subhead" numberOfLines={1}>
        {name}
      </ThemedText>
    </View>
  );
}

/**
 * Identity and the one number an operator opens this screen for: how long until
 * this donor can give again.
 *
 * The countdown gets a panel of its own rather than a stat tile because it is
 * the only figure here with three parts that have to be read together — days
 * left, how far through the interval, and the date it was counted from. A tile
 * showing "50" alone invites the question the panel answers.
 */
function DonorHero({
  donor,
  eligibility,
  countFrom,
}: {
  donor: AdminDonorDetail;
  eligibility: ReturnType<typeof computeEligibility>;
  countFrom?: string;
}) {
  const theme = useTheme();
  const elapsed = Math.round(eligibility.progress * PH_DONATION_INTERVAL_DAYS);

  return (
    <View style={[styles.hero, { borderColor: theme.border }]}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="donor-hero" x1="0" y1="0" x2="1" y2="0.8">
              <Stop offset="0" stopColor={theme.brandSubtle} />
              <Stop offset="0.7" stopColor={theme.heroVia} />
              <Stop offset="1" stopColor={theme.heroTo} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#donor-hero)" />
        </Svg>
      </View>

      <View style={styles.heroRow}>
        <View style={styles.identity}>
          {donor.bloodType ? (
            <DonorDrop type={donor.bloodType} />
          ) : (
            <View style={[styles.noType, { backgroundColor: theme.surfaceSunken }]}>
              <Ionicons name="help" size={28} color={theme.textTertiary} />
            </View>
          )}

          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              <ThemedText style={styles.name} numberOfLines={1}>
                {donor.fullName}
              </ThemedText>
              {donor.banned ? (
                <Badge label="Suspended" tone="danger" dot />
              ) : donor.hasProfile ? (
                <Badge label="Active" tone="success" dot />
              ) : (
                <Badge label="No profile" tone="warning" dot />
              )}
            </View>

            <View style={styles.metaRow}>
              <Meta icon="mail-outline" text={donor.email} />
              <Meta icon="location-outline" text={donor.city ?? 'No city on file'} />
              <Meta icon="calendar-outline" text={`Joined ${longDate(donor.createdAt)}`} />
            </View>
          </View>
        </View>

        <View style={[styles.countdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.countdownHead}>
            <ThemedText type="caption" color="textTertiary" style={styles.eyebrow}>
              NEXT ELIGIBLE DONATION
            </ThemedText>
            {countFrom ? (
              <ThemedText type="footnote" color="textTertiary">
                {elapsed} of {PH_DONATION_INTERVAL_DAYS} days
              </ThemedText>
            ) : null}
          </View>

          {countFrom ? (
            <>
              <View style={styles.countdownValue}>
                {eligibility.eligible ? (
                  <ThemedText style={[styles.bigNumber, { color: theme.success }]}>
                    Eligible now
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText style={styles.bigNumber}>{eligibility.daysRemaining}</ThemedText>
                    <ThemedText type="body" color="textSecondary" style={styles.bigUnit}>
                      days to go
                    </ThemedText>
                  </>
                )}
                <ThemedText
                  type="subhead"
                  style={{ color: eligibility.eligible ? theme.success : theme.brand }}>
                  {/* Past tense once the interval has elapsed: the date is when
                      they *became* eligible, and a bare future-looking date
                      reads as a day they are still waiting for. */}
                  {eligibility.eligible ? 'since ' : ''}
                  {dateWithYear(eligibility.nextEligibleDate.toISOString())}
                </ThemedText>
              </View>

              <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      // The bar is a second reading of the same number, never
                      // the only one — the days and the date are both stated.
                      width: `${Math.round(eligibility.progress * 100)}%`,
                      backgroundColor: eligibility.eligible ? theme.success : theme.brand,
                    },
                  ]}
                />
              </View>

              <ThemedText type="footnote" color="textTertiary">
                Counted from last donation on {longDate(countFrom)}
              </ThemedText>
            </>
          ) : (
            <View style={styles.countdownValue}>
              <ThemedText style={[styles.bigNumber, { color: theme.success }]}>
                Eligible now
              </ThemedText>
              <ThemedText type="footnote" color="textTertiary" style={styles.noDate}>
                No donation on file to count from.
              </ThemedText>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * The hero's blood-type mark. A drop rather than `BloodTypeGlyph`'s disc: at
 * this size the disc reads as an avatar, and the one thing an operator must not
 * misread on this screen is the blood type. Local to the hero — the disc stays
 * correct everywhere it is one row among many.
 */
function DonorDrop({ type }: { type: BloodType }) {
  const theme = useTheme();

  return (
    <View style={styles.drop} accessibilityLabel={`Blood type ${type}`}>
      <DropMark size={92} from={theme.brand} to={theme.brandStrong} />
      <ThemedText style={[styles.dropLabel, { color: theme.onBrand }]}>{type}</ThemedText>
    </View>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={15} color={theme.textTertiary} />
      <ThemedText type="subhead" color="textSecondary" numberOfLines={1}>
        {text}
      </ThemedText>
    </View>
  );
}

/** Icon, number, label — the compact horizontal form this screen's row wants. */
function MiniStat({
  icon,
  tint,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: 'brand' | 'info' | 'success' | 'warning' | 'neutral';
  value: string;
  label: string;
}) {
  const theme = useTheme();
  const tints: Record<typeof tint, { fg: ThemeColor; bg: ThemeColor }> = {
    brand: { fg: 'brand', bg: 'brandSubtle' },
    info: { fg: 'info', bg: 'infoSubtle' },
    success: { fg: 'success', bg: 'successSubtle' },
    warning: { fg: 'warning', bg: 'warningSubtle' },
    neutral: { fg: 'textSecondary', bg: 'surfaceSunken' },
  };
  const t = tints[tint];

  return (
    <View style={styles.tile}>
      <Card padding="base" radius="lg" style={styles.tileCard}>
        <View style={[styles.tileIcon, { backgroundColor: theme[t.bg] }]}>
          <Ionicons name={icon} size={19} color={theme[t.fg]} />
        </View>
        <View style={styles.tileText}>
          <ThemedText style={styles.tileValue} numberOfLines={1}>
            {value}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {label}
          </ThemedText>
        </View>
      </Card>
    </View>
  );
}

/** A titled card. Every block on this screen is one, so they line up. */
function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Card padding="lg" radius="lg" style={styles.panel}>
      <View style={styles.panelHead}>
        <ThemedText type="title2">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="footnote" color="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.tabs, { borderBottomColor: theme.border }]} accessibilityRole="tablist">
      {tabs.map((t) => {
        const selected = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${t.label}, ${t.count}`}
            style={({ hovered }) => [
              styles.tab,
              { borderBottomColor: selected ? theme.brand : 'transparent' },
              hovered && !selected ? { borderBottomColor: theme.borderStrong } : null,
            ]}>
            <ThemedText
              type="subhead"
              style={{ color: selected ? theme.brand : theme.textSecondary, fontWeight: '600' }}>
              {t.label}
            </ThemedText>
            <View
              style={[
                styles.tabCount,
                { backgroundColor: selected ? theme.brandSubtle : theme.surfaceSunken },
              ]}>
              <ThemedText
                type="caption"
                style={{ color: selected ? theme.brand : theme.textTertiary }}>
                {t.count}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The account's own fields, including the contact details staff act on. */
function DonorFacts({ donor }: { donor: AdminDonorDetail }) {
  const theme = useTheme();
  const toast = useToast();

  const copyId = () => {
    // Web-only screen, but a browser can still refuse the clipboard without a
    // secure context — say so rather than silently doing nothing.
    const clipboard = Platform.OS === 'web' ? globalThis.navigator?.clipboard : undefined;
    if (!clipboard) {
      toast.show('This browser would not give the console clipboard access.', 'warning');
      return;
    }
    void clipboard
      .writeText(donor.id)
      .then(() => toast.show('Account ID copied.', 'success'))
      .catch(() => toast.show('Could not copy the account ID.', 'danger'));
  };

  return (
    <View>
      <FactRow label="Email" value={donor.email} />
      <FactRow label="Phone" value={donor.phone ?? 'No phone on file'} muted={!donor.phone} />
      <FactRow label="City" value={donor.city ?? 'No city on file'} muted={!donor.city} />
      <FactRow label="Blood type">
        {donor.bloodType ? (
          <BloodTypeGlyph type={donor.bloodType} size="sm" />
        ) : (
          <ThemedText type="subhead" color="textTertiary">
            Not set
          </ThemedText>
        )}
      </FactRow>
      <FactRow label="Account ID" last>
        <View style={styles.idRow}>
          <View style={[styles.idChip, { backgroundColor: theme.surfaceSunken }]}>
            <ThemedText type="mono" numberOfLines={1}>
              {donor.id}
            </ThemedText>
          </View>
          <Pressable
            onPress={copyId}
            accessibilityRole="button"
            accessibilityLabel="Copy the account ID"
            style={({ hovered, pressed }) => [
              styles.copyButton,
              { borderColor: theme.border },
              hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
            ]}>
            <Ionicons name="copy-outline" size={15} color={theme.textSecondary} />
          </Pressable>
        </View>
      </FactRow>

      <Notice
        tone="info"
        icon={donor.hasLocation ? 'lock-closed-outline' : 'globe-outline'}
        title={donor.hasLocation ? 'Stored location is fuzzed.' : 'No stored location.'}
        body={
          donor.hasLocation
            ? 'This donor is matched by real distance. The coordinates stay on the server.'
            : 'This donor is matched by the per-city fallback distance and is included in every nearby push.'
        }
        inline
      />
    </View>
  );
}

function FactRow({
  label,
  value,
  muted,
  last,
  children,
}: {
  label: string;
  value?: string;
  muted?: boolean;
  last?: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.factRow,
        last ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}>
      <ThemedText type="subhead" color="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.factValue}>
        {children ?? (
          <ThemedText
            type="subhead"
            color={muted ? 'textTertiary' : 'text'}
            numberOfLines={1}
            style={styles.factText}>
            {value}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

/**
 * A tinted strip of explanation. Not `Card variant="tinted"`: these carry a
 * status color and an icon, and `tinted` is a neutral surface.
 */
function Notice({
  tone,
  icon,
  title,
  body,
  inline,
}: {
  tone: 'info' | 'warning' | 'danger';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  /** Sits inside a panel rather than standing alone in the page column. */
  inline?: boolean;
}) {
  const theme = useTheme();
  const map = {
    info: { fg: theme.info, bg: theme.infoSubtle },
    warning: { fg: theme.warning, bg: theme.warningSubtle },
    danger: { fg: theme.danger, bg: theme.dangerSubtle },
  }[tone];

  return (
    <View
      style={[styles.notice, { backgroundColor: map.bg }, inline ? styles.noticeInline : null]}
      accessibilityRole="summary">
      <Ionicons name={icon} size={16} color={map.fg} style={styles.noticeIcon} />
      <ThemedText type="footnote" color="textSecondary" style={styles.noticeText}>
        <ThemedText type="footnote" style={{ color: theme.text, fontWeight: '700' }}>
          {title}
        </ThemedText>{' '}
        {body}
      </ThemedText>
    </View>
  );
}

/** Shaped like the table it replaces, so an empty panel still has a floor. */
function EmptyBox({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.emptyBox, { borderColor: theme.border }]} accessibilityRole="summary">
      <View style={[styles.emptyIcon, { borderColor: theme.border }]}>
        <Ionicons name={icon} size={20} color={theme.textTertiary} />
      </View>
      <ThemedText type="headline" style={styles.center}>
        {title}
      </ThemedText>
      <ThemedText type="footnote" color="textSecondary" style={[styles.center, styles.emptyBody]}>
        {subtitle}
      </ThemedText>
    </View>
  );
}

function LastDonationForm({
  donor,
  value,
  error,
  busy,
  saving,
  onChange,
  onSave,
  onClear,
}: {
  donor: AdminDonorDetail;
  value: string;
  error?: string;
  busy: boolean;
  saving: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.form}>
      {donor.lastDonationDate ? (
        <View style={[styles.current, { backgroundColor: theme.brandSubtle }]}>
          <View style={[styles.currentIcon, { backgroundColor: theme.surface }]}>
            <Ionicons name="calendar-outline" size={16} color={theme.brand} />
          </View>
          <View style={styles.currentText}>
            <ThemedText type="footnote" color="textSecondary">
              Currently
            </ThemedText>
            <ThemedText type="headline">{longDate(donor.lastDonationDate)}</ThemedText>
          </View>
        </View>
      ) : (
        <ThemedText type="footnote" color="textSecondary">
          No date recorded. The countdown falls back to the newest donation on file.
        </ThemedText>
      )}

      <Input
        label="New date"
        placeholder="YYYY-MM-DD"
        value={value}
        onChangeText={onChange}
        error={error}
        hint="Must not be in the future."
        autoCapitalize="none"
        editable={donor.hasProfile && !busy}
      />
      <View style={styles.actions}>
        <Button
          label="Save date"
          icon="calendar-outline"
          size="sm"
          disabled={!donor.hasProfile || busy}
          loading={saving}
          onPress={onSave}
        />
        <Button
          label="Clear date"
          variant="secondary"
          size="sm"
          disabled={!donor.hasProfile || !donor.lastDonationDate || busy}
          onPress={onClear}
        />
      </View>
    </View>
  );
}

function AccountActions({
  donor,
  reason,
  reasonError,
  busy,
  reactivating,
  onReason,
  onReactivate,
  onSuspend,
  onDelete,
}: {
  donor: AdminDonorDetail;
  reason: string;
  reasonError?: string;
  busy: boolean;
  reactivating: boolean;
  onReason: (v: string) => void;
  onReactivate: () => void;
  onSuspend: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();

  return (
    <Card padding="lg" radius="lg">
      <View style={styles.accountRow}>
        <View style={styles.accountCopy}>
          <View style={styles.accountTitle}>
            <View style={[styles.accountIcon, { backgroundColor: theme.dangerSubtle }]}>
              <Ionicons name="warning-outline" size={19} color={theme.danger} />
            </View>
            <ThemedText type="title2">Account actions</ThemedText>
          </View>
          <ThemedText type="footnote" color="textSecondary">
            Every action is recorded with your name and the reason you give. Suspending takes effect
            immediately; deleting cannot be undone.
          </ThemedText>
        </View>

        <View style={styles.accountForm}>
          <Input
            label="Reason"
            placeholder="Why are you acting on this account?"
            value={reason}
            onChangeText={onReason}
            error={reasonError}
            multiline
            editable={!busy}
          />
          <View style={styles.accountActions}>
            <ThemedText type="footnote" color="textTertiary" style={styles.accountHint}>
              Required to suspend or delete. Recorded on every action.
            </ThemedText>
            {donor.banned ? (
              <Button
                label="Reactivate account"
                variant="secondary"
                icon="lock-open-outline"
                size="sm"
                disabled={busy}
                loading={reactivating}
                onPress={onReactivate}
              />
            ) : (
              <Button
                label="Suspend account"
                variant="dangerOutline"
                icon="hand-left-outline"
                size="sm"
                disabled={busy}
                onPress={onSuspend}
              />
            )}
            <Button
              label="Delete account"
              variant="danger"
              icon="trash-outline"
              size="sm"
              disabled={busy}
              onPress={onDelete}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

function Donations({ rows }: { rows: Donation[] }) {
  if (rows.length === 0) {
    return (
      <EmptyBox
        icon="water-outline"
        title="No donations recorded"
        subtitle="Completed appointments add a donation here automatically."
      />
    );
  }

  const columns: DataTableColumn<Donation>[] = [
    {
      key: 'date',
      header: 'Date',
      width: 140,
      render: (d) => <ThemedText type="subhead">{longDate(d.date)}</ThemedText>,
    },
    {
      key: 'center',
      header: 'Center',
      width: 220,
      grow: 2,
      render: (d) => (
        <View style={styles.stack}>
          <ThemedText type="headline" numberOfLines={1}>
            {d.centerName}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {d.city}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: 120,
      grow: 0,
      render: (d) => <ThemedText type="subhead">{DONATION_TYPE_LABEL[d.type]}</ThemedText>,
    },
    {
      key: 'units',
      header: 'Units',
      width: 70,
      grow: 0,
      numeric: true,
      render: (d) => <ThemedText type="subhead">{d.units}</ThemedText>,
    },
  ];

  return (
    <DataTable
      variant="outline"
      columns={columns}
      rows={rows}
      keyExtractor={(d) => d.id}
      state="ready"
      emptyTitle="No donations recorded"
    />
  );
}

function Appointments({ rows }: { rows: Appointment[] }) {
  if (rows.length === 0) {
    return (
      <EmptyBox
        icon="calendar-outline"
        title="No appointments booked"
        subtitle="Bookings the donor makes in the app appear here."
      />
    );
  }

  const columns: DataTableColumn<Appointment>[] = [
    {
      key: 'date',
      header: 'When',
      width: 170,
      render: (a) => (
        <View style={styles.stack}>
          <ThemedText type="subhead">{longDate(a.date)}</ThemedText>
          <ThemedText type="footnote" color="textSecondary">
            {timeOfDay(a.date)}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'center',
      header: 'Center',
      width: 220,
      grow: 2,
      render: (a) => (
        <View style={styles.stack}>
          <ThemedText type="headline" numberOfLines={1}>
            {a.centerName}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {a.address}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: 120,
      grow: 0,
      render: (a) => <ThemedText type="subhead">{DONATION_TYPE_LABEL[a.type]}</ThemedText>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      grow: 0,
      align: 'right',
      render: (a) => (
        <Badge label={APPOINTMENT_LABEL[a.status]} tone={APPOINTMENT_TONE[a.status]} />
      ),
    },
  ];

  return (
    <DataTable
      variant="outline"
      columns={columns}
      rows={rows}
      keyExtractor={(a) => a.id}
      state="ready"
      emptyTitle="No appointments booked"
    />
  );
}

function Responses({ rows }: { rows: AdminDonorResponse[] }) {
  if (rows.length === 0) {
    return (
      <EmptyBox
        icon="people-outline"
        title="No responses yet"
        subtitle="Requests this donor offers to give for appear here."
      />
    );
  }

  const columns: DataTableColumn<AdminDonorResponse>[] = [
    {
      key: 'when',
      header: 'Responded',
      width: 120,
      grow: 0,
      render: (r) => (
        <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
          {relativeTime(r.respondedAt)}
        </ThemedText>
      ),
    },
    {
      key: 'request',
      header: 'Request',
      width: 200,
      grow: 2,
      render: (r) => (
        <View style={styles.stack}>
          <ThemedText type="headline" numberOfLines={1}>
            {r.hospital}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {r.city}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: 60,
      grow: 0,
      render: (r) => <BloodTypeGlyph type={r.bloodType} size="sm" />,
    },
    {
      key: 'urgency',
      header: 'Urgency',
      width: 110,
      grow: 0,
      render: (r) => <Badge label={URGENCY_LABEL[r.urgency]} tone={URGENCY_TONE[r.urgency]} dot />,
    },
    {
      key: 'offer',
      header: 'Offer',
      width: 100,
      grow: 0,
      render: (r) => (
        <Badge
          label={r.status === 'confirmed' ? 'Confirmed' : 'Offered'}
          tone={r.status === 'confirmed' ? 'success' : 'info'}
        />
      ),
    },
    {
      key: 'requestStatus',
      header: 'Request now',
      width: 120,
      grow: 0,
      align: 'right',
      render: (r) => (
        <Badge label={STATUS_LABEL[r.requestStatus]} tone={STATUS_TONE[r.requestStatus]} />
      ),
    },
  ];

  return (
    <DataTable
      variant="outline"
      columns={columns}
      rows={rows}
      keyExtractor={(r) => r.id}
      state="ready"
      emptyTitle="No responses yet"
    />
  );
}

function Devices({ rows }: { rows: AdminDonorDevice[] }) {
  const theme = useTheme();

  if (rows.length === 0) {
    return (
      <View style={styles.stackLg}>
        <EmptyBox
          icon="phone-portrait-outline"
          title="No devices registered"
          subtitle="This donor would not receive an emergency push notification."
        />
        <View style={[styles.warnStrip, { backgroundColor: theme.warningSubtle }]}>
          <Ionicons name="warning-outline" size={15} color={theme.warning} />
          <ThemedText type="footnote" style={{ color: theme.warning }}>
            Unreachable by emergency push
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.deviceList}>
      {rows.map((d) => (
        <View
          key={d.id}
          style={[styles.device, { borderColor: theme.border }]}
          accessibilityRole="summary">
          <View style={[styles.deviceIcon, { backgroundColor: theme.surfaceSunken }]}>
            <Ionicons name="phone-portrait-outline" size={16} color={theme.textSecondary} />
          </View>
          <View style={styles.stack}>
            <ThemedText type="headline">{d.platform}</ThemedText>
            <ThemedText type="footnote" color="textSecondary">
              Registered {shortDate(d.updatedAt)} · {relativeTime(d.updatedAt)}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

function AuditTrail({ rows }: { rows: AuditEntry[] }) {
  const theme = useTheme();

  if (rows.length === 0) {
    return (
      <EmptyBox
        icon="shield-outline"
        title="No staff action yet"
        subtitle="Suspensions, reactivations, and date corrections are recorded here."
      />
    );
  }

  return (
    <View style={styles.auditList}>
      {rows.map((e) => (
        <View key={e.id} style={[styles.audit, { borderColor: theme.border }]}>
          <View style={styles.auditHead}>
            <ThemedText type="headline">{AUDIT_LABEL[e.action] ?? e.action}</ThemedText>
            <ThemedText type="footnote" color="textTertiary">
              {shortDate(e.createdAt)}, {timeOfDay(e.createdAt)}
            </ThemedText>
          </View>
          <ThemedText type="footnote" color="textSecondary">
            {e.actorName ?? 'Account removed'}
          </ThemedText>
          <ThemedText type="footnote" color={e.reason ? 'text' : 'textTertiary'}>
            {e.reason ?? 'No reason given'}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hero: { borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  heroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xl,
    padding: Spacing.xl,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    flex: 1,
    minWidth: 320,
  },
  drop: { alignItems: 'center', justifyContent: 'center' },
  dropLabel: { position: 'absolute', top: 36, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  noType: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, minWidth: 0, gap: Spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.md },
  name: { fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.lg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minWidth: 0 },

  countdown: {
    width: 380,
    flexGrow: 1,
    maxWidth: 440,
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  countdownHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  eyebrow: { letterSpacing: 0.8 },
  countdownValue: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: Spacing.sm },
  bigNumber: { fontSize: 34, lineHeight: 42, fontWeight: '700', letterSpacing: -0.9 },
  bigUnit: { flex: 1, minWidth: 0 },
  noDate: { flexBasis: '100%' },
  track: { height: 8, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base },
  tile: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 200 },
  tileCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { flex: 1, minWidth: 0 },
  tileValue: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.7 },

  // Two columns on a desktop window; both reflow to full width as it narrows,
  // because `flexBasis` plus `minWidth` is what breaks the row, not a query.
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base, alignItems: 'flex-start' },
  columnMain: { flexGrow: 3, flexShrink: 1, flexBasis: 560, minWidth: 420, gap: Spacing.base },
  columnSide: { flexGrow: 1, flexShrink: 1, flexBasis: 320, minWidth: 300, gap: Spacing.base },
  columnSplit: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base },
  half: { flexGrow: 1, flexShrink: 1, flexBasis: 260, minWidth: 240 },

  panel: { gap: Spacing.base },
  panelHead: { gap: Spacing.xs },

  tabs: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.xs,
    marginRight: Spacing.lg,
    borderBottomWidth: 2,
  },
  tabCount: {
    minWidth: 22,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },

  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  factValue: { flexShrink: 1, minWidth: 0, alignItems: 'flex-end' },
  factText: { textAlign: 'right' },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  idChip: {
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  copyButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notice: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  noticeInline: { marginTop: Spacing.md },
  noticeIcon: { marginTop: 2 },
  noticeText: { flex: 1, minWidth: 0 },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  center: { textAlign: 'center' },
  emptyBody: { maxWidth: 280 },

  form: { gap: Spacing.base },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  currentIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentText: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  accountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xl, alignItems: 'flex-start' },
  accountCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 320, minWidth: 280, gap: Spacing.md },
  accountTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountForm: { flexGrow: 2, flexShrink: 1, flexBasis: 420, minWidth: 320, gap: Spacing.md },
  accountActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  accountHint: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 180 },

  stack: { gap: 2 },
  stackLg: { gap: Spacing.md },
  warnStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },

  deviceList: { gap: Spacing.sm },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deviceIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  auditList: { gap: Spacing.sm },
  audit: {
    gap: 2,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  auditHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
});
