/**
 * /admin/appointments — booked donations: the day's schedule, the search over
 * it, and the drawer that books a slot on a donor's behalf.
 *
 * Laid out as one panel, the same shape `centers-list.tsx` uses: heading and
 * primary action above it, filters along its top edge, rows inside, pager
 * centred beneath. A booking screen is read as a schedule, so the row leads
 * with the day and time and marks the live ones with a dot beside the date —
 * never colour alone, since the status word sits in its own column.
 *
 * The row's single action is "View", which opens the booking's own route. The
 * staff transitions that used to sit inline — complete and cancel — live there
 * instead: completing a visit records a `donations` row and moves the donor's
 * eligibility countdown, and that is not a decision to make from a 48px row
 * with no context about who the donor is or when they last gave.
 *
 * Web-only; see appointments-list.native.tsx.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { DOT_COLOR, STATUS_LABEL, STATUS_TONE } from '@/components/admin/appointment-status';
import {
  DateFilter,
  dayEndISO,
  dayStartISO,
  type DayKey,
} from '@/components/admin/date-filter';
import { PageHeading } from '@/components/admin/page-heading';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { Pager, SearchField, Select, Toolbar } from '@/components/admin/toolbar';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Badge, Button, Card } from '@/components/ui';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Radius, Spacing } from '@/constants/theme';
import { useAdminAppointments } from '@/hooks/api/admin/use-admin-appointments';
import { useAdminCenters } from '@/hooks/api/admin/use-admin-centers';
import { useTheme } from '@/hooks/use-theme';
import { clockTime, dateWithYear } from '@/lib/format';
import type { AdminAppointment, AdminAppointmentFilters } from '@/types/api';
import type { Appointment } from '@/types/domain';

import { NewAppointmentForm } from './new-appointment-form';

const PAGE_SIZE = 10;

/** An empty string is "no filter" — `Select` needs a value to represent it. */
type StatusChoice = '' | Appointment['status'];

const STATUS_OPTIONS: { label: string; value: StatusChoice }[] = [
  { label: 'All status', value: '' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export function AdminAppointmentsList() {
  return <AdminGate>{() => <AppointmentsScreen />}</AdminGate>;
}

function AppointmentsScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusChoice>('');
  const [centerId, setCenterId] = useState('');
  const [day, setDay] = useState<DayKey | null>(null);
  const [page, setPage] = useState(0);
  const [booking, setBooking] = useState(false);
  // Bumped on every open so the drawer starts from a blank form, while the
  // closing one keeps its contents until its exit animation finishes.
  const [session, setSession] = useState(0);

  const filters = useMemo<AdminAppointmentFilters>(
    () => ({
      q: q.trim() || undefined,
      status: status || undefined,
      centerId: centerId || undefined,
      // One day is a closed range, not an open "from" — an operator filtered to
      // the 2nd should not also see the 3rd.
      dateFrom: day ? dayStartISO(day) : undefined,
      dateTo: day ? dayEndISO(day) : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [q, status, centerId, day, page],
  );

  const query = useAdminAppointments(filters);
  // Centers are a short list, so the filter is a real set of names rather than
  // asking staff to paste an id.
  const centers = useAdminCenters();

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // Any filter change invalidates the current page position: page 3 of the old
  // result set is meaningless in the new one.
  const onFilterChange =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      set(value);
      setPage(0);
    };

  const state: DataTableState = query.isPending ? 'loading' : query.isError ? 'error' : 'ready';

  const centerOptions = useMemo<{ label: string; value: string }[]>(
    () => [
      { label: 'All centers', value: '' },
      ...(centers.data ?? []).map((c) => ({ label: c.name, value: c.id })),
    ],
    [centers.data],
  );

  const columns: DataTableColumn<AdminAppointment>[] = [
    {
      key: 'when',
      header: 'Date & Time',
      width: 200,
      grow: 2,
      render: (a) => (
        <View style={styles.whenCell}>
          <View style={[styles.dot, { backgroundColor: theme[DOT_COLOR[a.status]] }]} />
          <View style={styles.stack}>
            <ThemedText type="headline" numberOfLines={1}>
              {dateWithYear(a.date)}
            </ThemedText>
            <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
              {clockTime(a.date)}
            </ThemedText>
          </View>
        </View>
      ),
    },
    {
      key: 'donor',
      header: 'Donor',
      width: 230,
      grow: 3,
      render: (a) => (
        <View style={styles.donorCell}>
          <Avatar name={a.donorName} color={a.donorAvatarColor} size={36} />
          <ThemedText type="headline" numberOfLines={1} style={styles.donorName}>
            {a.donorName}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'center',
      header: 'Center',
      width: 220,
      grow: 3,
      render: (a) => (
        <ThemedText type="body" numberOfLines={1}>
          {a.centerName}
        </ThemedText>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      grow: 1,
      render: (a) => <Badge label={STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 96,
      grow: 0,
      render: (a) => (
        <Button
          label="View"
          variant="secondary"
          size="sm"
          // Standalone: a reader walking a page of identical "View" buttons
          // still hears which booking each one opens.
          accessibilityLabel={`View ${a.donorName}'s appointment on ${dateWithYear(a.date)}`}
          onPress={() =>
            router.push({ pathname: '/admin/appointments/[id]', params: { id: a.id } })
          }
        />
      ),
    },
  ];

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(q.trim() || status || centerId || day);

  return (
    <AdminShell
      nav="appointments"
      title="Appointments"
      subtitle="View and manage donor appointments."
      showTitle={false}>
      <PageHeading
        title="Appointments"
        subtitle="View and manage donor appointments."
        actions={
          <>
            <DateFilter value={day} onChange={onFilterChange<DayKey | null>(setDay)} />
            <Button
              label="New appointment"
              icon="add"
              onPress={() => {
                setSession((n) => n + 1);
                setBooking(true);
              }}
              style={{ boxShadow: `0 8px 20px ${theme.brandGlow}` } as ViewStyle}
            />
          </>
        }
      />

      <Card padding={0} radius="lg" style={styles.panel}>
        <View style={styles.panelToolbar}>
          <Toolbar>
            <SearchField
              value={q}
              onChange={onFilterChange(setQ)}
              placeholder="Search donor name, center, or ID..."
              accessibilityLabel="Search appointments by donor name, center, or booking ID"
              grow
            />
            <Select
              label="Center"
              options={centerOptions}
              value={centerId}
              onChange={onFilterChange(setCenterId)}
            />
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={onFilterChange(setStatus)}
            />
          </Toolbar>
        </View>

        <DataTable
          variant="outline"
          columns={columns}
          rows={rows}
          keyExtractor={(a) => a.id}
          state={state}
          emptyTitle={filtered ? 'No appointments match these filters' : 'No appointments yet'}
          emptySubtitle={
            filtered
              ? 'Try another day, or clear a filter to see more bookings.'
              : 'Bookings made in the donor app appear here, and you can add one yourself.'
          }
          errorTitle="Could not load appointments"
          errorSubtitle="The console could not reach the server. Nothing has changed — check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      </Card>

      {state === 'ready' && total > 0 ? (
        <View style={styles.pagerRow}>
          <Pager page={page} pageCount={pageCount} onChange={setPage} />
        </View>
      ) : null}

      {/* An overlay, so it is last in the tree and costs the page no height
          while it is closed. */}
      <NewAppointmentForm
        key={session}
        visible={booking}
        centers={centers.data ?? []}
        onClose={() => setBooking(false)}
        onBooked={() => {
          setBooking(false);
          // The new booking is in the future, and the list is newest-first,
          // so it is on page one — wherever the operator was before.
          setPage(0);
        }}
      />
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  panel: { overflow: 'visible' },
  // A stacking context above the table, so an open filter menu paints over the
  // rows instead of behind them — the table is a later sibling and would
  // otherwise win on document order alone.
  panelToolbar: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    overflow: 'visible',
    zIndex: 20,
  },
  pagerRow: { alignItems: 'center', paddingTop: Spacing.xs },

  stack: { gap: 2, minWidth: 0 },
  whenCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    // The cell aligns its children to the start, which sizes them to their
    // content; without this the text ignores the column width and overruns the
    // next one instead of truncating.
    alignSelf: 'stretch',
  },
  dot: { width: 8, height: 8, borderRadius: Radius.full },
  donorCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    alignSelf: 'stretch',
  },
  donorName: { flex: 1, minWidth: 0 },
});
