/**
 * /admin/requests/[id] — one request, everyone who responded to it, and the
 * moderation actions.
 *
 * The screen is read top-down as one answer: the banner says what was asked for
 * and how much of it is accounted for, the tiles qualify it with four numbers,
 * and the two columns below separate what *happened* (responders, audit trail)
 * from what the request *is* (its details). Moderation sits last, after the
 * operator has had every chance to read the thing they are about to act on —
 * not above it, where a take-down button is the first control on screen.
 *
 * A take-down expires the request; it never deletes it. Donors may already be
 * travelling to the hospital on the strength of the push that went out, so the
 * copy here says what they will see, and the row stays on record with the
 * reason the operator gave.
 *
 * Detail is a route, not a modal, and confirmations are `ConfirmPanel` — the
 * design system forbids an invented centered web modal.
 *
 * Web-only; see request-detail.native.tsx.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ConfirmPanel } from '@/components/admin/confirm-panel';
import { NoAuditArt, NoRespondersArt } from '@/components/admin/empty-art';
import { Breadcrumb } from '@/components/admin/page-heading';
import { RequestHero } from '@/components/admin/request-hero';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ThemedText } from '@/components/themed-text';
import {
  Avatar,
  Badge,
  BloodTypeGlyph,
  Button,
  Card,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@/components/ui';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useAdminRequest, useModerateRequest } from '@/hooks/api/admin/use-admin-requests';
import { useTheme } from '@/hooks/use-theme';
import { clockTime, dateTime, distanceLabel, longDate, relativeTime } from '@/lib/format';
import type {
  AdminRequestDetail,
  AdminResponder,
  AuditEntry,
  ModerateAction,
} from '@/types/api';

/** What each action is called, and how consequential it looks. */
const ACTION_LABEL: Record<ModerateAction, string> = {
  verify: 'Record a verification',
  fulfill: 'Mark fulfilled',
  expire: 'Close this request',
  takedown: 'Take down this request',
};

const ACTION_PAST: Record<ModerateAction, string> = {
  verify: 'Verification recorded.',
  fulfill: 'Request marked fulfilled.',
  expire: 'Request closed.',
  takedown: 'Request taken down. Responders will see it as closed.',
};

/** Audit actions read back as sentences rather than dotted verbs. */
const AUDIT_LABEL: Record<string, string> = {
  'request.verify': 'Verified',
  'request.fulfill': 'Marked fulfilled',
  'request.expire': 'Closed',
  'request.takedown': 'Taken down',
};

/** Below this the two columns stack rather than squeezing the side panel. */
const TWO_COLUMN = 1120;

export function AdminRequestDetailScreen() {
  return <AdminGate>{() => <Detail />}</AdminGate>;
}

function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const query = useAdminRequest(id);
  const moderate = useModerateRequest(id);

  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  // The destructive action awaiting confirmation, if any.
  const [pending, setPending] = useState<ModerateAction | null>(null);

  if (query.isPending) {
    return (
      <AdminShell nav="requests" title="Request" onBack={() => router.back()}>
        <Skeleton height={160} radius={Radius.xl} />
        <Skeleton height={96} radius={Radius.xl} />
        <Skeleton height={280} radius={Radius.xl} />
      </AdminShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AdminShell nav="requests" title="Request" onBack={() => router.back()}>
        <Card padding={0}>
          <EmptyState
            icon="alert-circle-outline"
            title="Could not open this request"
            subtitle="It may have been removed, or the console could not reach the server. Nothing has changed."
            actionLabel="Try again"
            onAction={() => void query.refetch()}
          />
        </Card>
      </AdminShell>
    );
  }

  const req = query.data;
  const closed = req.status === 'expired';
  const wide = width >= TWO_COLUMN;

  const run = (action: ModerateAction) => {
    const trimmed = reason.trim();
    if (action === 'takedown' && !trimmed) {
      setReasonError('A reason is required to take a request down.');
      return;
    }
    setReasonError(undefined);
    moderate.mutate(
      { action, reason: trimmed || undefined },
      {
        onSuccess: () => {
          setReason('');
          toast.show(ACTION_PAST[action], action === 'takedown' ? 'warning' : 'success');
        },
        // The server's message is the specific one — a 409 explains which
        // transition no longer applies.
        onError: (err) => toast.show(err.message, 'danger'),
      },
    );
  };

  /** ConfirmPanel has no busy state, so callers close first, then mutate. */
  const confirm = () => {
    const action = pending;
    setPending(null);
    if (action) run(action);
  };

  return (
    <AdminShell
      nav="requests"
      title={req.hospital}
      subtitle={`${req.city} · patient ${req.patientInitials}`}
      showTitle={false}>
      <Breadcrumb
        onBack={() => router.back()}
        trail={[
          { label: 'Requests', onPress: () => router.push('/admin/requests') },
          { label: req.hospital },
        ]}
      />

      <RequestHero req={req} width={width} />

      <SummaryTiles req={req} />

      <View style={[styles.columns, wide ? null : styles.columnsStacked]}>
        <View style={styles.main}>
          <Responders rows={req.responders} fallbackDistanceKm={req.distanceKm} />
          <AuditTrail rows={req.auditTrail} />
        </View>

        <View style={styles.side}>
          <RequestFacts req={req} />
        </View>
      </View>

      <Moderation
        closed={closed}
        busy={moderate.isPending}
        fulfilled={req.status === 'fulfilled'}
        reason={reason}
        reasonError={reasonError}
        onReason={(v) => {
          setReason(v);
          if (reasonError) setReasonError(undefined);
        }}
        onRun={run}
        onConfirmFirst={setPending}
      />

      <ConfirmPanel
        visible={pending === 'expire'}
        destructive
        title={`Close the request at ${req.hospital}?`}
        message={`Its ${req.respondersCount} responders will see it as closed, and it leaves the donor feed. The request is not deleted — it stays on record with your reason.`}
        confirmLabel="Close request"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmPanel
        visible={pending === 'takedown'}
        destructive
        title={`Take down the request at ${req.hospital}?`}
        message={`Donors who were pushed this request will see it as closed, and its ${req.respondersCount} responders will stop being asked to donate. The record and your reason are kept.`}
        confirmLabel="Take it down"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </AdminShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel — the shape every section on this page shares.                        */
/* -------------------------------------------------------------------------- */

/**
 * A titled card. The heading lives *inside* the card rather than above it
 * (`SectionHeader` + `Card`, as this screen used to do) because this page shows
 * four sections at once: a floating heading above each one gives the column a
 * second rhythm of its own and doubles the vertical space the page spends on
 * labels.
 */
function Panel({
  title,
  subtitle,
  icon,
  tint,
  trailing,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: { fg: ThemeColor; bg: ThemeColor };
  /** A count chip, usually — anything that qualifies the title. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <Card style={styles.panel}>
      <View style={styles.panelHead}>
        {icon && tint ? (
          <View style={[styles.panelIcon, { backgroundColor: theme[tint.bg] }]}>
            <Ionicons name={icon} size={18} color={theme[tint.fg]} />
          </View>
        ) : null}
        <View style={styles.panelTitle}>
          <ThemedText type="title2">{title}</ThemedText>
          {subtitle ? (
            <ThemedText type="subhead" color="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {trailing}
      </View>
      {children}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary tiles                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The four numbers that qualify the banner. Horizontal rather than stacked —
 * at four across, an icon above its value makes each tile twice as tall for no
 * added information.
 */
function SummaryTiles({ req }: { req: AdminRequestDetail }) {
  const unanswered = req.respondersCount === 0 && req.status === 'open';

  return (
    <View style={styles.tiles}>
      <SummaryTile
        icon="water-outline"
        tint={{ fg: 'brand', bg: 'brandSubtle' }}
        value={`${req.unitsFulfilled}/${req.unitsNeeded}`}
        label="Units"
      />
      <SummaryTile
        icon="people-outline"
        tint={unanswered ? { fg: 'danger', bg: 'dangerSubtle' } : { fg: 'info', bg: 'infoSubtle' }}
        value={String(req.respondersCount)}
        label="Responders"
      />
      <SummaryTile
        icon="time-outline"
        tint={{ fg: 'textSecondary', bg: 'surfaceSunken' }}
        value={elapsed(req.postedAt)}
        label="Posted ago"
      />
      <SummaryTile
        icon="alarm-outline"
        tint={{ fg: 'warning', bg: 'warningSubtle' }}
        value={clockTime(req.neededBy)}
        label={`Needed by · ${shortDay(req.neededBy)}`}
      />
    </View>
  );
}

function SummaryTile({
  icon,
  tint,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: { fg: ThemeColor; bg: ThemeColor };
  value: string;
  label: string;
}) {
  const theme = useTheme();

  return (
    <Card style={styles.tile} padding="base">
      <View style={styles.tileRow}>
        <View style={[styles.tileIcon, { backgroundColor: theme[tint.bg] }]}>
          <Ionicons name={icon} size={20} color={theme[tint.fg]} />
        </View>
        <View style={styles.tileText}>
          <ThemedText type="title2" numberOfLines={1}>
            {value}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {label}
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

/** `relativeTime` without its "ago" — the tile's label supplies the direction. */
function elapsed(iso: string): string {
  return relativeTime(iso).replace(/^in /, '').replace(/ ago$/, '');
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/* Request details                                                            */
/* -------------------------------------------------------------------------- */

/** The request's own fields, including the contact details staff act on. */
function RequestFacts({ req }: { req: AdminRequestDetail }) {
  return (
    <Panel title="Request details">
      <View style={styles.people}>
        <PersonTile
          eyebrow="CONTACT"
          name={req.contactName}
          line={req.contactPhone}
          icon="call-outline"
        />
        <PersonTile
          eyebrow="POSTED BY"
          name={req.ownerName}
          line={req.ownerEmail}
          icon="mail-outline"
        />
      </View>

      <View style={styles.factList}>
        <FactRow label="Posted" value={dateTime(req.postedAt)} />
        <FactRow label="Needed by" value={dateTime(req.neededBy)} />
        <FactRow
          label="Distance shown to donors"
          value={
            req.hasCoordinates
              ? `${distanceLabel(req.distanceKm)} fallback`
              : `${distanceLabel(req.distanceKm)} · fixed`
          }
        />
        {req.note ? <FactRow label="Note" value={req.note} /> : null}
      </View>

      <CopyField label="Request ID" value={req.id} />

      <InfoNote>
        {req.hasCoordinates
          ? `${distanceLabel(req.distanceKm)} is a fallback. Real distances are computed per donor.`
          : `No location is attached to this request, so every donor is shown ${distanceLabel(req.distanceKm)}.`}
      </InfoNote>
    </Panel>
  );
}

/** One named human, their avatar, and the one way to reach them. */
function PersonTile({
  eyebrow,
  name,
  line,
  icon,
}: {
  eyebrow: string;
  name: string;
  line: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();

  return (
    <View
      style={[styles.person, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
      <Avatar name={name} size={40} />
      <View style={styles.personText}>
        <ThemedText type="caption" color="textTertiary" style={styles.eyebrow}>
          {eyebrow}
        </ThemedText>
        <ThemedText type="headline" numberOfLines={1}>
          {name}
        </ThemedText>
        <View style={styles.personLine}>
          <Ionicons name={icon} size={13} color={theme.textTertiary} />
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {line}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.factRow, { borderBottomColor: theme.border }]}>
      <ThemedText type="subhead" color="textSecondary" style={styles.factLabel}>
        {label}
      </ThemedText>
      <ThemedText type="subhead" style={styles.factValue}>
        {value}
      </ThemedText>
    </View>
  );
}

/**
 * The id, in full, next to a button that puts it on the clipboard — staff paste
 * it into tickets and read it back over the phone, and a 40-character uuid is
 * the one field on this page nobody should be retyping.
 */
function CopyField({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    // Web-only surface, so the clipboard API is simply available; a browser
    // that refuses it leaves the id selectable on screen, which is why the
    // value is rendered as text rather than hidden behind the button.
    void globalThis.navigator?.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };

  return (
    <View style={styles.copyWrap}>
      <ThemedText type="subhead" color="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.copyRow}>
        <View
          style={[styles.copyBox, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
          <ThemedText type="mono" numberOfLines={1}>
            {value}
          </ThemedText>
        </View>
        <Pressable
          onPress={copy}
          accessibilityRole="button"
          accessibilityLabel={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
          style={({ hovered, pressed }) => [
            styles.copyButton,
            { borderColor: theme.border, backgroundColor: theme.surface },
            hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
          ]}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={16}
            color={copied ? theme.success : theme.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

/** A quiet aside that qualifies the figures above it. Never carries an action. */
function InfoNote({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: theme.infoSubtle }]}>
      <Ionicons name="information-circle-outline" size={16} color={theme.info} />
      <ThemedText type="footnote" color="textSecondary" style={styles.noteText}>
        {children}
      </ThemedText>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Responders and audit trail                                                 */
/* -------------------------------------------------------------------------- */

function Responders({
  rows,
  fallbackDistanceKm,
}: {
  rows: AdminResponder[];
  fallbackDistanceKm: number;
}) {
  const columns: DataTableColumn<AdminResponder>[] = [
    {
      key: 'donor',
      header: 'Donor',
      width: 190,
      grow: 2,
      render: (r) => (
        <View style={styles.stack}>
          <ThemedText type="headline" numberOfLines={1}>
            {r.fullName}
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
      width: 64,
      grow: 0,
      render: (r) => <BloodTypeGlyph type={r.bloodType} size="sm" />,
    },
    {
      key: 'contact',
      header: 'Contact',
      width: 220,
      grow: 2,
      render: (r) => (
        <View style={styles.stack}>
          <ThemedText type="subhead" numberOfLines={1}>
            {r.email}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {r.phone ?? 'No phone on file'}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'distance',
      header: 'To hospital',
      width: 104,
      grow: 0,
      render: (r) => (
        <ThemedText type="subhead">
          {r.distanceKm === fallbackDistanceKm
            ? `~${distanceLabel(r.distanceKm)}`
            : distanceLabel(r.distanceKm)}
        </ThemedText>
      ),
    },
    {
      key: 'responded',
      header: 'Responded',
      width: 112,
      grow: 0,
      render: (r) => (
        <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
          {relativeTime(r.respondedAt)}
        </ThemedText>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 104,
      grow: 0,
      align: 'right',
      render: (r) => (
        <Badge
          label={r.status === 'confirmed' ? 'Confirmed' : 'Offered'}
          tone={r.status === 'confirmed' ? 'success' : 'info'}
        />
      ),
    },
  ];

  return (
    <Panel
      title="Responders"
      subtitle="Donors who offered to give for this request. Distances are derived server-side; a leading ~ means no donor location was available."
      trailing={<CountChip count={rows.length} />}>
      {rows.length === 0 ? (
        <IllustratedEmpty
          art={<NoRespondersArt size={152} />}
          title="No one has responded yet"
          subtitle="Donors who offer to give will appear here with their contact details."
        />
      ) : (
        <DataTable
          variant="outline"
          columns={columns}
          rows={rows}
          keyExtractor={(r) => r.id}
          state="ready"
          emptyTitle="No one has responded yet"
        />
      )}
    </Panel>
  );
}

function AuditTrail({ rows }: { rows: AuditEntry[] }) {
  const columns: DataTableColumn<AuditEntry>[] = [
    {
      key: 'when',
      header: 'When',
      width: 170,
      grow: 1,
      render: (e) => (
        <View style={styles.stack}>
          <ThemedText type="subhead" numberOfLines={1}>
            {longDate(e.createdAt)}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary">
            {clockTime(e.createdAt)}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: 140,
      grow: 1,
      render: (e) => (
        <ThemedText type="headline" numberOfLines={1}>
          {AUDIT_LABEL[e.action] ?? e.action}
        </ThemedText>
      ),
    },
    {
      key: 'actor',
      header: 'Admin',
      width: 160,
      grow: 1,
      render: (e) => (
        <ThemedText type="subhead" color={e.actorName ? 'text' : 'textSecondary'} numberOfLines={1}>
          {e.actorName ?? 'Account removed'}
        </ThemedText>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      width: 240,
      grow: 2,
      render: (e) => (
        <ThemedText type="body" color={e.reason ? 'text' : 'textTertiary'}>
          {e.reason ?? 'No reason given'}
        </ThemedText>
      ),
    },
  ];

  return (
    <Panel title="Audit trail" subtitle="Every staff action taken on this request.">
      {rows.length === 0 ? (
        <IllustratedEmpty
          dashed
          art={<NoAuditArt />}
          title="No staff action yet"
          subtitle="Verifications, closures, and take-downs are recorded here as they happen."
        />
      ) : (
        <DataTable
          variant="outline"
          columns={columns}
          rows={rows}
          keyExtractor={(e) => e.id}
          state="ready"
          emptyTitle="No staff action yet"
        />
      )}
    </Panel>
  );
}

function CountChip({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.countChip, { backgroundColor: theme.surfaceSunken }]}>
      <ThemedText type="footnote" color="textSecondary">
        {count}
      </ThemedText>
    </View>
  );
}

/**
 * The "nothing has happened yet" state for a panel whose emptiness is normal.
 * `dashed` marks a space that is waiting to be filled — an audit trail with no
 * rows is an outline of where rows will go, not a missing thing.
 */
function IllustratedEmpty({
  art,
  title,
  subtitle,
  dashed,
}: {
  art: ReactNode;
  title: string;
  subtitle: string;
  dashed?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.empty,
        dashed
          ? ({
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: theme.border,
              borderRadius: Radius.lg,
            } as const)
          : null,
      ]}
      accessibilityRole="summary">
      {art}
      <ThemedText type="headline" style={styles.emptyText}>
        {title}
      </ThemedText>
      <ThemedText type="subhead" color="textSecondary" style={styles.emptySubtitle}>
        {subtitle}
      </ThemedText>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Moderation                                                                 */
/* -------------------------------------------------------------------------- */

function Moderation({
  closed,
  busy,
  fulfilled,
  reason,
  reasonError,
  onReason,
  onRun,
  onConfirmFirst,
}: {
  closed: boolean;
  busy: boolean;
  fulfilled: boolean;
  reason: string;
  reasonError?: string;
  onReason: (value: string) => void;
  /** Runs immediately — for the two actions that do not close the request. */
  onRun: (action: ModerateAction) => void;
  /** Opens a confirmation first — for the two that do. */
  onConfirmFirst: (action: ModerateAction) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.moderation, { borderColor: theme.border }]}>
      {/* The same wash the banner opens on, so the page is bracketed by its two
          consequential surfaces rather than ending on a flat pink slab. */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="moderation-wash" x1="0" y1="0" x2="1" y2="0.9">
              <Stop offset="0" stopColor={theme.brandSubtle} />
              <Stop offset="1" stopColor={theme.surface} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#moderation-wash)" />
        </Svg>
      </View>

      <View style={styles.panelHead}>
        <View style={[styles.panelIcon, { backgroundColor: theme.surface }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.brand} />
        </View>
        <View style={styles.panelTitle}>
          <ThemedText type="title2">Moderation</ThemedText>
        </View>
      </View>

      <ThemedText type="subhead" color="textSecondary">
        {closed
          ? 'This request is already closed. It stays on record, and the actions below no longer apply.'
          : 'Every action is recorded with your name and the reason you give. A take-down closes the request; it is never deleted.'}
      </ThemedText>

      <Input
        label="Reason"
        placeholder="Why are you acting on this request?"
        value={reason}
        onChangeText={onReason}
        error={reasonError}
        hint="Required to take a request down. Recorded on every action."
        multiline
        editable={!closed}
      />

      <View style={styles.actions}>
        <Button
          label={ACTION_LABEL.verify}
          variant="secondary"
          icon="shield-checkmark-outline"
          disabled={closed || busy}
          loading={busy}
          onPress={() => onRun('verify')}
        />
        <Button
          label={ACTION_LABEL.fulfill}
          variant="successSoft"
          icon="checkmark-done-outline"
          disabled={closed || fulfilled || busy}
          onPress={() => onRun('fulfill')}
        />
        <Button
          label={ACTION_LABEL.expire}
          variant="dangerOutline"
          icon="close-circle-outline"
          disabled={closed || busy}
          onPress={() => onConfirmFirst('expire')}
        />
        <Button
          label={ACTION_LABEL.takedown}
          variant="danger"
          icon="hand-left-outline"
          disabled={closed || busy}
          onPress={() => onConfirmFirst('takedown')}
          style={closed ? undefined : ({ boxShadow: `0 8px 20px ${theme.brandGlow}` } as never)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base },
  // Reflow rather than squash: four across on a monitor, two on a tablet.
  tile: { flexGrow: 1, flexBasis: 210, minWidth: 180 },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { flex: 1, minWidth: 0, gap: 2 },

  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.base },
  columnsStacked: { flexDirection: 'column' },
  main: { flex: 2, minWidth: 0, gap: Spacing.base },
  side: { flex: 1, minWidth: 320, gap: Spacing.base },

  panel: { gap: Spacing.base },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  panelIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: { flex: 1, minWidth: 0, gap: 2 },
  countChip: {
    minWidth: 28,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignItems: 'center',
  },

  people: { gap: Spacing.md },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  personText: { flex: 1, minWidth: 0, gap: 2 },
  personLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minWidth: 0 },
  eyebrow: { letterSpacing: 1 },

  factList: { gap: 0 },
  factRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  factLabel: { flexShrink: 0 },
  factValue: { flex: 1, textAlign: 'right', fontWeight: '600' },

  copyWrap: { gap: Spacing.sm },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  copyBox: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    height: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copyButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  note: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  noteText: { flex: 1, minWidth: 0 },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.lg,
  },
  emptyText: { textAlign: 'center', marginTop: Spacing.md },
  emptySubtitle: { textAlign: 'center', maxWidth: 340 },

  stack: { gap: 2, minWidth: 0 },

  moderation: {
    gap: Spacing.base,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    // The wash is an absolutely-filled SVG child; without this it paints over
    // the rounded corners it is supposed to sit inside.
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
