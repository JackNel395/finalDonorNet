/**
 * /admin/overview — the console's landing screen.
 *
 * Added because the console had no dashboard: `/admin` redirected straight into
 * the requests table, so an operator opening it was dropped into row one of a
 * list with no sense of whether anything needed them. This answers the question
 * they actually arrive with — is anything on fire, and what should I open
 * first.
 *
 * It composes the existing guarded list endpoints rather than adding an
 * `/api/admin/overview` route. Every one of them already returns `total`
 * alongside its page, so a count costs a `limit=1` query against a route that
 * is already audited, already behind `requireAdmin`, and already serializes
 * through the admin mappers. A new aggregate route would duplicate all three
 * for numbers the server can already produce.
 *
 * The one thing those routes cannot answer is *direction* — a total has no
 * sense of movement — so the tiles' change line comes from
 * `/api/admin/overview/trends`, which counts real timestamp columns. Nothing on
 * this screen is a placeholder figure: a tile with no comparable baseline says
 * so in words rather than printing a percentage it cannot support.
 *
 * The attention list is deliberately *open* requests ordered as the API returns
 * them, not a separate "critical" feed: an operator who clears this list has
 * cleared the queue, and a second ranking would invite them to trust it.
 *
 * Web-only; see overview.native.tsx.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { MetricCard } from '@/components/admin/metric-card';
import { OverviewHero } from '@/components/admin/overview-hero';
import { STATUS_LABEL, STATUS_TONE } from '@/components/admin/request-status';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ThemedText } from '@/components/themed-text';
import {
  Badge,
  BloodTypeGlyph,
  Card,
  Skeleton,
  URGENCY_LABEL,
  URGENCY_TONE,
} from '@/components/ui';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Radius, Spacing } from '@/constants/theme';
import { useAdminAppointments } from '@/hooks/api/admin/use-admin-appointments';
import { useAdminRequests } from '@/hooks/api/admin/use-admin-requests';
import { useAdminTrends } from '@/hooks/api/admin/use-admin-trends';
import { useAdminUsers } from '@/hooks/api/admin/use-admin-users';
import { useTheme } from '@/hooks/use-theme';
import { distanceLabel, relativeTime } from '@/lib/format';
import type { AdminRequest } from '@/types/api';

/** Rows in the attention list — a screenful, not a second copy of the table. */
const ATTENTION_ROWS = 6;

export function AdminOverview() {
  return <AdminGate>{() => <OverviewScreen />}</AdminGate>;
}

function OverviewScreen() {
  const router = useRouter();

  // `limit: 1` because only `total` is read from these three.
  const openRequests = useAdminRequests({ status: 'open', limit: 1 });
  const criticalOpen = useAdminRequests({ status: 'open', urgency: 'critical', limit: 1 });
  const donors = useAdminUsers({ limit: 1 });
  const upcoming = useAdminAppointments({ status: 'confirmed', limit: 1 });
  const trends = useAdminTrends();

  const attention = useAdminRequests({ status: 'open', limit: ATTENTION_ROWS });

  const state: DataTableState = attention.isPending
    ? 'loading'
    : attention.isError
      ? 'error'
      : 'ready';

  const columns: DataTableColumn<AdminRequest>[] = [
    {
      key: 'urgency',
      header: 'Urgency',
      width: 104,
      grow: 0,
      render: (r) => <Badge label={URGENCY_LABEL[r.urgency]} tone={URGENCY_TONE[r.urgency]} dot />,
    },
    {
      key: 'bloodType',
      header: 'Type',
      width: 56,
      grow: 0,
      render: (r) => <BloodTypeGlyph type={r.bloodType} size="sm" />,
    },
    {
      key: 'hospital',
      header: 'Hospital',
      width: 240,
      grow: 3,
      render: (r) => (
        <View style={styles.stack}>
          <ThemedText type="headline" numberOfLines={1}>
            {r.hospital}
          </ThemedText>
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {r.city} · {distanceLabel(r.distanceKm)}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'units',
      header: 'Units',
      width: 72,
      grow: 0,
      numeric: true,
      render: (r) => (
        <ThemedText type="subhead">
          {r.unitsFulfilled}/{r.unitsNeeded}
        </ThemedText>
      ),
    },
    {
      key: 'responders',
      header: 'Responders',
      width: 96,
      grow: 0,
      numeric: true,
      // A request with no responders is the one a human most needs to see.
      render: (r) => (
        <ThemedText type="subhead" color={r.respondersCount === 0 ? 'danger' : 'text'}>
          {r.respondersCount}
        </ThemedText>
      ),
    },
    {
      key: 'posted',
      header: 'Posted',
      width: 104,
      grow: 0,
      align: 'right',
      render: (r) => (
        <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
          {relativeTime(r.postedAt)}
        </ThemedText>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 112,
      grow: 0,
      align: 'right',
      render: (r) => <Badge label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />,
    },
  ];

  const allRequests = () => router.replace('/admin/requests');

  return (
    <AdminShell
      nav="overview"
      title="Overview"
      subtitle="Where the queue stands right now."
      showTitle={false}>
      <OverviewHero
        title="Overview"
        subtitle="Here's what's happening with your operations today."
      />

      <View style={styles.tiles}>
        <Metric
          label="Open requests"
          value={openRequests.data?.total}
          loading={openRequests.isPending}
          failed={openRequests.isError}
          icon="document-text-outline"
          tint="brand"
          period="last week"
          trend={trends.data?.requestsWeekly}
          onPress={allRequests}
          openLabel="Open the requests list"
        />
        <Metric
          label="Critical and open"
          value={criticalOpen.data?.total}
          loading={criticalOpen.isPending}
          failed={criticalOpen.isError}
          icon="warning-outline"
          tint="info"
          period="last week"
          trend={trends.data?.criticalWeekly}
          onPress={allRequests}
          openLabel="Open the requests list, filtered to critical"
        />
        <Metric
          label="Registered donors"
          value={donors.data?.total}
          loading={donors.isPending}
          failed={donors.isError}
          icon="people-outline"
          tint="success"
          period="last month"
          trend={trends.data?.donorsMonthly}
          onPress={() => router.replace('/admin/users')}
          openLabel="Open the donors list"
        />
        <Metric
          label="Confirmed appointments"
          value={upcoming.data?.total}
          loading={upcoming.isPending}
          failed={upcoming.isError}
          icon="calendar-outline"
          tint="accent"
          period="last week"
          trend={trends.data?.appointmentsWeekly}
          onPress={() => router.replace('/admin/appointments')}
          openLabel="Open the appointments list"
        />
      </View>

      <Card padding="lg" radius="lg" style={styles.panel}>
        <AttentionHeader onAll={allRequests} />

        <DataTable
          variant="outline"
          columns={columns}
          rows={attention.data?.rows ?? []}
          keyExtractor={(r) => r.id}
          state={state}
          onRowPress={(r) =>
            router.push({ pathname: '/admin/requests/[id]', params: { id: r.id } })
          }
          rowLabel={(r) =>
            `${URGENCY_LABEL[r.urgency]} request for ${r.bloodType} at ${r.hospital}. ` +
            `${r.respondersCount} responders.`
          }
          emptyTitle="Nothing is waiting"
          emptySubtitle="No request is currently open. Closed and fulfilled requests are in the Requests list."
          emptySlot={<QueueClear onAll={allRequests} />}
          errorTitle="Could not load the queue"
          errorSubtitle="The console could not reach the server. Nothing has changed — check your connection and try again."
          onRetry={() => void attention.refetch()}
        />
      </Card>
    </AdminShell>
  );
}

/** Panel heading: what this list is, and the way out to the full one. */
function AttentionHeader({ onAll }: { onAll: () => void }) {
  const theme = useTheme();

  return (
    <View style={styles.panelHead}>
      <View style={[styles.panelIcon, { backgroundColor: theme.brandSubtle }]}>
        <Ionicons name="document-text-outline" size={19} color={theme.brand} />
      </View>
      <View style={styles.panelTitles}>
        <ThemedText type="title2">Needs attention</ThemedText>
        <ThemedText type="footnote" color="textSecondary">
          Open requests, newest first.
        </ThemedText>
      </View>
      <Pressable
        onPress={onAll}
        accessibilityRole="link"
        accessibilityLabel="Open the full requests list"
        style={({ hovered, pressed }) => [
          styles.allButton,
          { borderColor: theme.border, backgroundColor: theme.surface },
          hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
        ]}>
        <Ionicons name="options-outline" size={15} color={theme.textTertiary} />
        <ThemedText type="subhead">All requests</ThemedText>
        <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
      </Pressable>
    </View>
  );
}

/**
 * An empty queue is the good outcome, so this says so rather than apologising
 * for missing content — and still offers the one thing an operator looking at
 * an empty queue usually wants, which is the history behind it.
 */
function QueueClear({ onAll }: { onAll: () => void }) {
  const theme = useTheme();
  // `brandDeep` is a near-black ink: right against a white panel, invisible
  // against a dark one. In dark mode the same contrast comes from inverting.
  const ctaBg = theme.isDark ? theme.text : theme.brandDeep;
  const ctaFg = theme.isDark ? theme.background : theme.onColor;

  return (
    <View style={styles.empty} accessibilityRole="summary">
      <View style={[styles.emptyArt, { backgroundColor: theme.surfaceSunken }]}>
        <Ionicons name="file-tray-outline" size={34} color={theme.textTertiary} />
        <View style={[styles.emptyBadge, { backgroundColor: theme.infoSubtle }]}>
          <Ionicons name="time-outline" size={16} color={theme.info} />
        </View>
      </View>

      <ThemedText type="title2" style={styles.emptyText}>
        Nothing is waiting
      </ThemedText>
      <ThemedText type="subhead" color="textSecondary" style={[styles.emptyText, styles.emptyBody]}>
        No request is currently open. Closed and fulfilled requests are in the Requests list.
      </ThemedText>

      <Pressable
        onPress={onAll}
        accessibilityRole="link"
        accessibilityLabel="View all requests"
        style={({ hovered, pressed }) => [
          styles.emptyCta,
          { backgroundColor: ctaBg, opacity: hovered || pressed ? 0.88 : 1 },
        ]}>
        <Ionicons name="document-text-outline" size={16} color={ctaFg} />
        <ThemedText type="subhead" style={{ color: ctaFg }}>
          View all requests
        </ThemedText>
        <Ionicons name="arrow-forward" size={15} color={ctaFg} />
      </Pressable>
    </View>
  );
}

/**
 * One headline number. A failed count shows an em dash rather than `0`: zero
 * open requests and "we could not ask" are opposite facts, and on this screen
 * the difference decides whether an operator goes home.
 */
function Metric({
  label,
  value,
  loading,
  failed,
  icon,
  tint,
  period,
  trend,
  onPress,
  openLabel,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  failed: boolean;
} & Omit<Parameters<typeof MetricCard>[0], 'label' | 'value'>) {
  if (loading) {
    return (
      <View style={styles.tile}>
        <Card padding="lg" radius="lg">
          <Skeleton width={40} height={40} radius={Radius.md} />
          <View style={styles.skeletonGap} />
          <Skeleton width={72} height={32} />
          <Skeleton width="70%" height={14} />
          <View style={styles.skeletonGap} />
          <Skeleton width="90%" height={20} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.tile}>
      <MetricCard
        label={failed ? `${label} — unavailable` : label}
        value={failed ? '—' : String(value ?? 0)}
        icon={icon}
        tint={failed ? 'neutral' : tint}
        period={period}
        trend={failed ? undefined : trend}
        onPress={onPress}
        openLabel={openLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps to two rows, then one, as the window narrows; `minWidth` on the tile
  // is what forces the break rather than a width query.
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base },
  tile: { flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 240 },
  skeletonGap: { height: Spacing.md },

  panel: { gap: Spacing.lg },
  panelHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.md,
  },
  panelIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitles: { flex: 1, minWidth: 0, gap: 2 },
  allButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 44,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xs,
  },
  emptyArt: {
    width: 86,
    height: 86,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyBadge: {
    position: 'absolute',
    right: -2,
    top: 2,
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { textAlign: 'center' },
  emptyBody: { maxWidth: 330 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    marginTop: Spacing.base,
  },

  stack: { gap: 2 },
});
