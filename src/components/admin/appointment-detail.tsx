/**
 * /admin/appointments/[id] — one booking, the donor behind it, and the two
 * staff transitions.
 *
 * Completing from here is not a bookkeeping flag: it records a `donations` row
 * and advances the donor's last-donation date, exactly as the donor's own tap
 * would, because both call the same server-side transition. That is why the
 * actions live on this screen rather than on a row in the list — the operator
 * can see whose visit it is, when it was, and what the consequence is, before
 * changing when that person may give again.
 *
 * The page is laid out as a banner over two columns rather than one stack of
 * full-width cards. The stack made every fact the same size, so the booking's
 * id and the donor's phone number had the same weight as the date, and the
 * operator scrolled past the two things they came to do. Now the banner answers
 * "when, and how far along", the left column carries the two things staff
 * actually dial or drive to (the donor and the center) over the actions, and
 * the right column keeps the full record for reading back — the same facts, but
 * in the place you go when you need them rather than in the way.
 *
 * Detail is a route, not a modal, and confirmations are `ConfirmPanel` — the
 * design system forbids an invented centered web modal.
 *
 * Web-only; see appointment-detail.native.tsx.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ConfirmPanel } from '@/components/admin/confirm-panel';
import { AppointmentHero } from '@/components/admin/appointment-hero';
import { STATUS_LABEL, STATUS_TONE } from '@/components/admin/appointment-status';
import { DropMark, MapSketch } from '@/components/admin/marks';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Badge, Button, Card, EmptyState, Skeleton, useToast } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  useAdminAppointment,
  useAppointmentAction,
} from '@/hooks/api/admin/use-admin-appointments';
import { useTheme } from '@/hooks/use-theme';
import { DONATION_TYPE_LABEL } from '@/lib/booking';
import { clockTime, longDate } from '@/lib/format';
import type { AdminAppointment, AppointmentAdminAction } from '@/types/api';

/** Above this the record column sits beside the working column; below, under it. */
const TWO_COLUMN = 1240;
/** Above this the donor and the center sit side by side inside the left column. */
const PAIR = 860;
/** The record column's share of the row. The working column gets the rest. */
const RECORD_FLEX = 1;
const WORK_FLEX = 1.56;

export function AdminAppointmentDetailScreen() {
  return <AdminGate>{() => <Detail />}</AdminGate>;
}

function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();

  const query = useAdminAppointment(id);
  const action = useAppointmentAction(id);

  /** The transition awaiting confirmation, if any. */
  const [pending, setPending] = useState<AppointmentAdminAction | null>(null);

  if (query.isPending) {
    return (
      <AdminShell nav="appointments" title="Appointment" onBack={() => router.back()}>
        <Skeleton height={244} radius={Radius.xl} />
        <Skeleton height={420} radius={Radius.xl} />
      </AdminShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AdminShell nav="appointments" title="Appointment" onBack={() => router.back()}>
        <Card padding={0}>
          <EmptyState
            icon="alert-circle-outline"
            title="Could not open this appointment"
            subtitle="It may have been removed, or the console could not reach the server. Nothing has changed."
            actionLabel="Try again"
            onAction={() => void query.refetch()}
          />
        </Card>
      </AdminShell>
    );
  }

  const apt = query.data;
  // Only a live booking can be acted on; a completed or cancelled one has
  // nothing left to change.
  const live = apt.status === 'confirmed' || apt.status === 'pending';
  // The banner already carries the hero width; these are the inner columns.
  const stacked = width < TWO_COLUMN;
  const paired = width >= PAIR;

  /** ConfirmPanel has no busy state, so callers close first, then mutate. */
  const confirm = () => {
    const target = pending;
    setPending(null);
    if (!target) return;
    action.mutate(
      { action: target },
      {
        onSuccess: () =>
          toast.show(
            target === 'complete'
              ? `Donation recorded for ${apt.donorName}. Their donation-interval countdown now starts from this visit.`
              : `${apt.donorName}'s appointment was cancelled.`,
            target === 'complete' ? 'success' : 'warning',
          ),
        // The server's message is the specific one — a 409 explains which
        // transition no longer applies.
        onError: (err) => toast.show(err.message, 'danger'),
      },
    );
  };

  const openDonor = () =>
    router.push({ pathname: '/admin/users/[id]', params: { id: apt.donorId } });

  return (
    <AdminShell
      nav="appointments"
      title={apt.donorName}
      onBack={() => router.back()}
      breadcrumb={[
        { label: 'Appointments', href: '/admin/appointments' },
        { label: apt.donorName },
      ]}>
      <AppointmentHero apt={apt} width={width} />

      <View style={[styles.columns, stacked && styles.columnsStacked]}>
        <View style={[styles.work, stacked && styles.full]}>
          <View style={[styles.pair, paired ? null : styles.pairStacked]}>
            <DonorCard apt={apt} onOpen={openDonor} paired={paired} />
            <CenterCard apt={apt} paired={paired} />
          </View>

          <VisitCard
            apt={apt}
            live={live}
            busy={action.isPending}
            onComplete={() => setPending('complete')}
            onCancel={() => setPending('cancel')}
            onOpenDonor={openDonor}
          />
        </View>

        <View style={[styles.record, stacked && styles.full]}>
          <Facts apt={apt} />
        </View>
      </View>

      <ConfirmPanel
        visible={pending === 'complete'}
        title={`Record ${apt.donorName}'s donation?`}
        message={`This adds a ${DONATION_TYPE_LABEL[apt.type].toLowerCase()} donation on ${longDate(apt.date)} and starts their donation-interval countdown from that date, so they will not be asked to give again until it has elapsed.`}
        confirmLabel="Record donation"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmPanel
        visible={pending === 'cancel'}
        destructive
        title={`Cancel ${apt.donorName}'s appointment?`}
        message={`Their ${clockTime(apt.date)} slot on ${longDate(apt.date)} at ${apt.centerName} is released. They are not notified automatically, so reach them on ${apt.donorPhone ?? apt.donorEmail}.`}
        confirmLabel="Cancel appointment"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </AdminShell>
  );
}

/**
 * Who is coming, and how to reach them. The email and phone are the card's
 * point: when a slot has to move, this is the line staff dial, so it is set as
 * contact rows rather than buried in a run-on subtitle.
 */
function DonorCard({
  apt,
  onOpen,
  paired,
}: {
  apt: AdminAppointment;
  onOpen: () => void;
  /** Side by side with the center card, so it shares the row's width. */
  paired: boolean;
}) {
  const theme = useTheme();

  return (
    <Card style={paired ? styles.cardFill : undefined}>
      <View style={styles.cardStack}>
        <View style={styles.cardHead}>
          <ThemedText type="caption" color="textTertiary" style={styles.eyebrow}>
            DONOR
          </ThemedText>
          <Pressable
            onPress={onOpen}
            accessibilityRole="link"
            accessibilityLabel={`Open ${apt.donorName}'s donor record`}
            style={({ hovered, pressed }) => [
              styles.link,
              hovered || pressed ? { backgroundColor: theme.infoSubtle } : null,
            ]}>
            <ThemedText type="footnote" style={{ color: theme.info }}>
              Open donor
            </ThemedText>
            <Ionicons name="open-outline" size={14} color={theme.info} />
          </Pressable>
        </View>

        <View style={styles.donorRow}>
          <Avatar name={apt.donorName} color={apt.donorAvatarColor} size={64} />
          <View style={styles.donorName}>
            <ThemedText type="title2" numberOfLines={2}>
              {apt.donorName}
            </ThemedText>
            <ThemedText type="footnote" color="textSecondary">
              Registered donor
            </ThemedText>
          </View>
          {apt.donorBloodType ? <TypeDrop type={apt.donorBloodType} /> : null}
        </View>

        <View style={styles.contacts}>
          <Contact icon="mail-outline" value={apt.donorEmail} />
          {apt.donorPhone ? <Contact icon="call-outline" value={apt.donorPhone} /> : null}
        </View>
      </View>
    </Card>
  );
}

/**
 * The donor's type in the product's own drop rather than in `BloodTypeGlyph`'s
 * circle — the same mark the request banner uses, so a type means the same
 * shape wherever the console shows one.
 */
function TypeDrop({ type }: { type: string }) {
  const theme = useTheme();
  return (
    <View style={styles.drop} accessibilityLabel={`Blood type ${type}`} accessibilityRole="image">
      <DropMark size={DROP} from={theme.brand} to={theme.brandStrong} />
      <View style={styles.dropLabel}>
        <ThemedText style={[styles.dropText, { color: theme.onBrand }]}>{type}</ThemedText>
      </View>
    </View>
  );
}

const DROP = 58;

function Contact({ icon, value }: { icon: keyof typeof Ionicons.glyphMap; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.contact}>
      <Ionicons name={icon} size={18} color={theme.textTertiary} />
      <ThemedText type="body" numberOfLines={1} style={styles.contactValue}>
        {value}
      </ThemedText>
    </View>
  );
}

/** Where the donor is expected, with the street line staff read back to them. */
function CenterCard({ apt, paired }: { apt: AdminAppointment; paired: boolean }) {
  const theme = useTheme();

  return (
    <Card padding={0} style={paired ? styles.cardFill : undefined}>
      <View style={styles.mapFrame}>
        <MapSketch
          width="100%"
          height={MAP_HEIGHT}
          land={theme.infoSubtle}
          water={theme.info}
          road={theme.surface}
          block={theme.borderStrong}
          pin={theme.brand}
        />
      </View>

      <View style={styles.centerBody}>
        <ThemedText type="caption" color="textTertiary" style={styles.eyebrow}>
          CENTER
        </ThemedText>
        <ThemedText type="title2" numberOfLines={3}>
          {apt.centerName}
        </ThemedText>
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={17} color={theme.textTertiary} />
          <ThemedText type="footnote" color="textSecondary" style={styles.addressText}>
            {`${apt.address}, ${apt.centerCity}`}
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

const MAP_HEIGHT = 180;

/**
 * The two staff transitions, each stated before it is offered.
 *
 * The tiles are not duplicate buttons: completing a booking rewrites when the
 * donor may next give, and cancelling frees a slot someone else can take. Both
 * consequences land on a person who is not in the room, so each is written out
 * above the row rather than left to a confirmation sheet the operator reads
 * only after deciding.
 */
function VisitCard({
  apt,
  live,
  busy,
  onComplete,
  onCancel,
  onOpenDonor,
}: {
  apt: AdminAppointment;
  live: boolean;
  busy: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onOpenDonor: () => void;
}) {
  const theme = useTheme();

  return (
    <Card>
      <View style={styles.visitStack}>
        <View style={styles.visitHead}>
          <View style={[styles.visitIcon, { backgroundColor: theme.successSubtle }]}>
            <Ionicons name="pulse-outline" size={21} color={theme.success} />
          </View>
          <ThemedText type="title2">Visit</ThemedText>
        </View>

        <ThemedText type="body" color="textSecondary">
          {live
            ? 'Record what happened at the center once the donor has visited.'
            : `This booking is already ${STATUS_LABEL[apt.status].toLowerCase()}. It stays on record, and the actions below no longer apply.`}
        </ThemedText>

        {/* Only a live booking gets the two outcomes spelled out. On a settled
            one they would describe consequences the server will refuse, and a
            disabled button under a confident green panel reads as a fault
            rather than as a booking that is already closed. */}
        {live ? (
          <View style={styles.outcomes}>
            <Outcome
              icon="checkmark-circle-outline"
              tone="success"
              title="Mark complete"
              body="Records the donation and starts the donor’s recovery countdown from the visit date."
            />
            <Outcome
              icon="close-circle-outline"
              tone="danger"
              title="Cancel appointment"
              body="Releases the slot so another donor can book it."
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Mark complete"
            variant="success"
            icon="checkmark-circle-outline"
            disabled={!live || busy}
            onPress={onComplete}
          />
          <Button
            label="Cancel appointment"
            variant="dangerOutline"
            icon="close-circle-outline"
            disabled={!live || busy}
            onPress={onCancel}
          />
          <Button
            label="Open donor"
            variant="secondary"
            icon="person-outline"
            onPress={onOpenDonor}
            style={styles.pushRight}
          />
        </View>
      </View>
    </Card>
  );
}

/** What one of the two transitions does, stated before the button that does it. */
function Outcome({
  icon,
  tone,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'success' | 'danger';
  title: string;
  body: string;
}) {
  const theme = useTheme();
  const fg = tone === 'success' ? theme.success : theme.danger;
  const bg = tone === 'success' ? theme.successSubtle : theme.dangerSubtle;

  return (
    <View
      style={[styles.outcome, { backgroundColor: bg, borderColor: fg }]}
      {...({ 'aria-hidden': true } as object)}>
      <View style={[styles.outcomeIcon, { backgroundColor: theme.surface }]}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>
      <View style={styles.outcomeText}>
        <ThemedText type="bodyStrong">{title}</ThemedText>
        <ThemedText type="footnote" color="textSecondary">
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * The booking's own fields, as a record rather than a stack of headings: the
 * label sits left and the value right across a hairline, which is the shape a
 * reference panel is read in — down the left edge for the field, across for the
 * answer.
 */
function Facts({ apt }: { apt: AdminAppointment }) {
  return (
    <Card>
      <View style={styles.factsStack}>
        <ThemedText type="title2">Appointment details</ThemedText>

        <View style={styles.facts}>
          <Fact label="When" value={`${longDate(apt.date)} at ${clockTime(apt.date)}`} />
          <Fact label="Donation type" value={DONATION_TYPE_LABEL[apt.type]} />
          <Fact label="Center" value={apt.centerName} />
          <Fact label="City" value={apt.centerCity} />
          <Fact label="Address" value={apt.address} />
          <Fact label="Status">
            <Badge label={STATUS_LABEL[apt.status]} tone={STATUS_TONE[apt.status]} uppercase={false} />
          </Fact>
        </View>

        <IdField id={apt.id} />
      </View>
    </Card>
  );
}

function Fact({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.fact, { borderBottomColor: theme.border }]}>
      <ThemedText type="subhead" color="textSecondary" style={styles.factLabel}>
        {label}
      </ThemedText>
      {children ?? (
        <ThemedText type="bodyStrong" style={styles.factValue}>
          {value}
        </ThemedText>
      )}
    </View>
  );
}

/**
 * The booking id, on its own line because it is the one field nobody reads and
 * everybody pastes — into a support thread, a bug report, a database query. It
 * gets a copy control for that reason, and the control reports what it did
 * rather than flashing silently.
 */
function IdField({ id }: { id: string }) {
  const theme = useTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    // No expo-clipboard in this project, and the console is web-only, so the
    // platform's own clipboard is the whole implementation.
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.clipboard) {
      toast.show('Copying is not available here. Select the id to copy it.', 'warning');
      return;
    }
    void navigator.clipboard.writeText(id).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => toast.show('Could not copy the appointment id.', 'danger'),
    );
  };

  return (
    <View style={styles.idField}>
      <ThemedText type="subhead" color="textSecondary">
        Appointment ID
      </ThemedText>
      <View style={styles.idRow}>
        <View
          style={[styles.idBox, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
          <ThemedText type="mono" numberOfLines={1}>
            {id}
          </ThemedText>
        </View>
        <Pressable
          onPress={copy}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Appointment id copied' : 'Copy the appointment id'}
          style={({ hovered, pressed }) => [
            styles.copyButton,
            { borderColor: theme.border },
            hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
          ]}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={17}
            color={copied ? theme.success : theme.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xl },
  columnsStacked: { flexDirection: 'column' },
  work: { flex: WORK_FLEX, minWidth: 0, gap: Spacing.xl },
  record: { flex: RECORD_FLEX, minWidth: 0 },
  // Not `flex: 0`: React Native's shorthand resolves that to a zero basis with
  // no grow, which collapses the column to zero height once the row stacks and
  // leaves its cards drawing over the one below.
  full: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch' },

  pair: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.xl },
  pairStacked: { flexDirection: 'column' },
  cardFill: { flex: 1, minWidth: 0 },
  cardStack: { flex: 1, gap: Spacing.lg },

  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { letterSpacing: 1.1 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginHorizontal: -Spacing.sm,
    borderRadius: Radius.sm,
  },

  donorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  drop: { alignItems: 'center', justifyContent: 'center' },
  // Centred on the drop's bowl, which sits below its point.
  dropLabel: { position: 'absolute', top: DROP * 0.46 },
  dropText: { fontSize: 17, lineHeight: 20, fontWeight: '700', letterSpacing: -0.4 },
  donorName: { flex: 1, minWidth: 0, gap: 2 },
  contacts: { gap: Spacing.md },
  contact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minWidth: 0 },
  contactValue: { flex: 1, minWidth: 0 },

  mapFrame: { height: MAP_HEIGHT, overflow: 'hidden' },
  centerBody: { padding: Spacing.lg, gap: Spacing.sm },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  addressText: { flex: 1, minWidth: 0 },

  visitStack: { gap: Spacing.base },
  visitHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  visitIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base },
  outcome: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  outcomeIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeText: { flex: 1, minWidth: 0, gap: 2 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md },
  pushRight: { marginLeft: 'auto' },

  factsStack: { gap: Spacing.base },
  facts: { gap: 0 },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  factLabel: { flexShrink: 0 },
  factValue: { flex: 1, minWidth: 0, textAlign: 'right' },

  idField: { gap: Spacing.sm },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  idBox: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copyButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
