/**
 * /admin/requests — the moderation list. The highest-risk surface in the app:
 * every row here fanned push out to every compatible donor within 50 km, and
 * this is where a human can narrow that set down and act on one.
 *
 * The screen is management-first: a summary strip, then one card holding the
 * filters and the table together. Creating a request is an edge case staff
 * reach for by name — it lives behind the heading's one primary action and
 * opens in a `Drawer`, so the nine fields it needs never stand between an
 * operator and the queue they came to read.
 *
 * The filters and the table share one card. Keeping the toolbar inside the card ties the controls to the
 * rows they narrow — on a page that also carries four counts and a page title,
 * a free-floating filter row reads as page chrome rather than as part of the
 * table.
 *
 * The four counts above are deliberately *unfiltered*: they describe the whole
 * queue, so narrowing the table never changes the numbers that tell staff how
 * much work is outstanding.
 *
 * Web-only; see requests-list.native.tsx.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { BloodTypeFilter } from '@/components/admin/blood-type-filter';
import { NewRequestForm } from '@/components/admin/new-request-form';
import { PageHeading } from '@/components/admin/page-heading';
import { STATUS_LABEL, STATUS_TONE } from '@/components/admin/request-status';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ClearFilters, Pager, SearchField, Select, Toolbar } from '@/components/admin/toolbar';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, StatTile, URGENCY_LABEL, URGENCY_TONE } from '@/components/ui';
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
} from '@/components/ui/data-table';
import { Radius, Spacing } from '@/constants/theme';
import { useAdminRequests } from '@/hooks/api/admin/use-admin-requests';
import { useTheme } from '@/hooks/use-theme';
import { dateTime, distanceLabel } from '@/lib/format';
import type { AdminRequest, AdminRequestFilters } from '@/types/api';
import type { BloodType, RequestStatus, Urgency } from '@/types/domain';

const PAGE_SIZE = 25;

/** An empty string is "no filter" — the selects need a value to represent it. */
type StatusChoice = '' | RequestStatus;
type UrgencyChoice = '' | Urgency;
type WindowChoice = '' | '1' | '7' | '30';
type SortChoice = 'newest' | 'oldest';

const STATUS_OPTIONS: { label: string; value: StatusChoice }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Partly filled', value: 'partial' },
  { label: 'Fulfilled', value: 'fulfilled' },
  { label: 'Closed', value: 'expired' },
];

const URGENCY_OPTIONS: { label: string; value: UrgencyChoice }[] = [
  { label: 'Any', value: '' },
  { label: 'Critical', value: 'critical' },
  { label: 'Urgent', value: 'urgent' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Routine', value: 'routine' },
];

const WINDOW_OPTIONS: { label: string; value: WindowChoice }[] = [
  { label: 'Any time', value: '' },
  { label: 'Past day', value: '1' },
  { label: 'Past week', value: '7' },
  { label: 'Past month', value: '30' },
];

const SORT_OPTIONS: { label: string; value: SortChoice }[] = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
];

/**
 * Short, human-scannable stand-in for the row's stored id — four characters is
 * enough to read one off a screen and onto a phone call, and the search box
 * matches on the same substring, so a quoted id finds its row again.
 */
function shortId(id: string): string {
  return `#DN-${id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()}`;
}

export function AdminRequestsList() {
  return <AdminGate>{() => <RequestsScreen />}</AdminGate>;
}

function RequestsScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusChoice>('');
  const [urgency, setUrgency] = useState<UrgencyChoice>('');
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [postedWithin, setPostedWithin] = useState<WindowChoice>('');
  const [sort, setSort] = useState<SortChoice>('newest');
  const [page, setPage] = useState(0);
  const [composing, setComposing] = useState(false);

  const filters = useMemo<AdminRequestFilters>(
    () => ({
      q: q.trim() || undefined,
      status: status || undefined,
      urgency: urgency || undefined,
      bloodType: bloodType ?? undefined,
      postedWithinDays: postedWithin ? Number(postedWithin) : undefined,
      sort,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [q, status, urgency, bloodType, postedWithin, sort, page],
  );

  const query = useAdminRequests(filters);
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // Lightweight, count-only queries for the summary row — independent of the
  // operator's current filters, so the tiles always describe the whole queue,
  // not just what is currently narrowed into view.
  const openCount = useAdminRequests({ status: 'open', limit: 1 }).data?.total ?? 0;
  const criticalCount =
    useAdminRequests({ status: 'open', urgency: 'critical', limit: 1 }).data?.total ?? 0;
  const inProgressCount = useAdminRequests({ status: 'partial', limit: 1 }).data?.total ?? 0;
  const completedCount = useAdminRequests({ status: 'fulfilled', limit: 1 }).data?.total ?? 0;

  // Any filter change invalidates the current page position: page 3 of the old
  // result set is meaningless in the new one.
  const onFilterChange =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      set(value);
      setPage(0);
    };

  const activeFilters = [q.trim(), status, urgency, bloodType, postedWithin].filter(Boolean).length;

  const clearFilters = () => {
    setQ('');
    setStatus('');
    setUrgency('');
    setBloodType(null);
    setPostedWithin('');
    setPage(0);
  };

  const state: DataTableState = query.isPending ? 'loading' : query.isError ? 'error' : 'ready';

  const columns: DataTableColumn<AdminRequest>[] = [
    {
      key: 'id',
      header: 'ID',
      width: 92,
      grow: 0,
      render: (r) => (
        <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
          {shortId(r.id)}
        </ThemedText>
      ),
    },
    {
      key: 'patient',
      // "Patient", not "Patient name": this app stores initials and nothing
      // more, on purpose. A column headed "name" showing "M.S." would read as
      // truncation rather than as the deliberate limit it is.
      header: 'Patient',
      width: 92,
      grow: 0,
      render: (r) => (
        <ThemedText type="subhead" numberOfLines={1}>
          {r.patientInitials}
        </ThemedText>
      ),
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
          {/* The responder count rides along here rather than taking a column
              of its own: an open request nobody has answered is the single
              thing on this screen worth chasing, and it would be the first
              casualty of a tighter column set. */}
          <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
            {r.city} · {distanceLabel(r.distanceKm)} · {r.respondersCount}{' '}
            {r.respondersCount === 1 ? 'responder' : 'responders'}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'bloodType',
      header: 'Blood type',
      width: 92,
      grow: 0,
      render: (r) => <BloodTypeText type={r.bloodType} />,
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
      key: 'status',
      header: 'Status',
      width: 150,
      grow: 0,
      // Status and urgency are separate facts here, and both decide what staff
      // do next — so the cell carries the status pill, plus the urgency pill
      // while the request is still open and can still be acted on. Once it is
      // fulfilled or closed the urgency is history and only clutters the row.
      render: (r) => (
        <View style={styles.badges}>
          <Badge label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />
          {r.status === 'open' || r.status === 'partial' ? (
            <Badge label={URGENCY_LABEL[r.urgency]} tone={URGENCY_TONE[r.urgency]} dot />
          ) : null}
        </View>
      ),
    },
    {
      key: 'posted',
      header: 'Requested at',
      width: 180,
      grow: 0,
      render: (r) => (
        <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
          {dateTime(r.postedAt)}
        </ThemedText>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 88,
      grow: 0,
      align: 'right',
      render: (r) => (
        <Button
          label="View"
          variant="secondary"
          size="sm"
          // Standalone: every row in the table carries an identical "View".
          accessibilityLabel={`View request ${shortId(r.id)} at ${r.hospital}`}
          onPress={() => router.push({ pathname: '/admin/requests/[id]', params: { id: r.id } })}
        />
      ),
    },
  ];

  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = page * PAGE_SIZE + rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell nav="requests" title="Requests" showTitle={false}>
      <PageHeading
        title="Requests"
        subtitle="Manage emergency blood requests and donor responses."
        actions={<Button label="New request" icon="add" onPress={() => setComposing(true)} />}
      />

      <View style={styles.stats}>
        <StatTile variant="filled" tint="danger" label="Open" value={String(openCount)} />
        <StatTile variant="filled" tint="warning" label="Critical" value={String(criticalCount)} />
        <StatTile variant="filled" tint="info" label="In progress" value={String(inProgressCount)} />
        <StatTile
          variant="filled"
          tint="success"
          label="Completed"
          value={String(completedCount)}
        />
      </View>

      <TablePanel>
        <View style={styles.panelToolbar}>
          <Toolbar>
            <SearchField
              value={q}
              onChange={onFilterChange(setQ)}
              placeholder="Search by hospital, city, patient initials, or request ID"
              accessibilityLabel="Search requests by hospital, city, patient initials, or request ID"
              grow
            />
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={onFilterChange(setStatus)}
            />
            <Select
              label="Urgency"
              options={URGENCY_OPTIONS}
              value={urgency}
              onChange={onFilterChange(setUrgency)}
            />
            <BloodTypeFilter
              value={bloodType}
              onChange={onFilterChange<BloodType | null>(setBloodType)}
            />
            <Select
              label="Posted"
              options={WINDOW_OPTIONS}
              value={postedWithin}
              onChange={onFilterChange(setPostedWithin)}
            />
            <Select
              label="Sort"
              options={SORT_OPTIONS}
              value={sort}
              onChange={setSort}
              tintActive={false}
            />
            <ClearFilters count={activeFilters} onPress={clearFilters} />
          </Toolbar>
        </View>

        <DataTable
          variant="outline"
          columns={columns}
          rows={rows}
          keyExtractor={(r) => r.id}
          state={state}
          emptyTitle="No requests match these filters"
          emptySubtitle="Widen the time window or clear a filter to see more."
          errorTitle="Could not load requests"
          errorSubtitle="The console could not reach the server. Nothing has changed — check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      </TablePanel>

      {state === 'ready' && total > 0 ? (
        <View style={styles.pagerRow}>
          <Pager page={page} pageCount={pageCount} onChange={setPage} />
          <ThemedText type="footnote" color="textTertiary">
            Showing {first}–{last} of {total}
          </ThemedText>
        </View>
      ) : null}

      {/* An overlay, so it is last in the tree and costs the page no height
          while it is closed. */}
      <NewRequestForm
        visible={composing}
        onClose={() => setComposing(false)}
        // The donor-feed hook invalidates its own keys and knows nothing about
        // the console's, so the list is refreshed from here.
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ['admin', 'requests'] });
          setPage(0);
        }}
      />
    </AdminShell>
  );
}

/**
 * The card that holds the filters and the table.
 *
 * A component rather than an inline style on the screen, because `AdminShell`
 * is what installs `ConsoleThemeProvider` — anything that reads `useTheme()`
 * in the component that *renders* the shell gets the donor app's theme
 * instead, and stays light while the console is dark.
 */
function TablePanel({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {children}
    </View>
  );
}

/** A column's `render` is not a component, so the tinted cell has to be one. */
function BloodTypeText({ type }: { type: BloodType }) {
  const theme = useTheme();
  return (
    <ThemedText type="bodyStrong" style={{ color: theme.brand }}>
      {type}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 2 },
  badges: { gap: Spacing.xs, alignItems: 'flex-start' },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base },

  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    // The toolbar's open menus have to escape the panel: a react-native-web
    // View clips its children, which would cut a dropdown off at the card edge.
    overflow: 'visible',
    boxShadow: '0 1px 2px rgba(22, 25, 45, 0.04)',
  },
  panelToolbar: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    overflow: 'visible',
    // `Toolbar` carries its own z-index, but only against its siblings *inside*
    // this wrapper. The wrapper itself has to outrank the table below it, or
    // the rows paint over an open menu and swallow its clicks.
    zIndex: 20,
  },

  // Centred as one column: the pager is the control, and the range it is
  // paging through reads as its caption rather than as a separate stat.
  pagerRow: { alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.xs },
});
