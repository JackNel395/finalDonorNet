/**
 * /admin/users — donor accounts.
 *
 * Staff see contact details here: name, email, phone, city, blood type, last
 * donation, and registered device count. That is the deliberate, recorded
 * widening of what the server exposes, and the operational reason the console
 * exists — a suspicious request cannot be verified, and a donor cannot be
 * reached, without them. Coordinates are **not** among them and never will be.
 *
 * Web-only; see users-list.native.tsx.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BloodTypeFilter } from '@/components/admin/blood-type-filter';
import { CardGrid } from '@/components/admin/card-grid';
import { DonorCard } from '@/components/admin/donor-card';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ClearFilters, Pager, SearchField, Select, Toolbar } from '@/components/admin/toolbar';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, Skeleton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAdminUsers } from '@/hooks/api/admin/use-admin-users';
import { useTheme } from '@/hooks/use-theme';
import type { AdminDonor, AdminDonorFilters, AdminDonorStatus } from '@/types/api';
import type { BloodType } from '@/types/domain';

/**
 * Twelve fills four rows of three on a wide monitor and never leaves a ragged
 * single card on the last one.
 */
const PAGE_SIZE = 12;
const SKELETON_CARDS = 6;

/** An empty string is "no filter"; `Select` needs a value to represent it. */
type StatusChoice = '' | AdminDonorStatus;

const STATUS_OPTIONS: { label: string; value: StatusChoice }[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'No profile', value: 'incomplete' },
];

export function AdminUsersList() {
  return <AdminGate>{() => <UsersScreen />}</AdminGate>;
}

function UsersScreen() {
  const router = useRouter();

  const [q, setQ] = useState('');
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<StatusChoice>('');
  const [page, setPage] = useState(0);

  const filters = useMemo<AdminDonorFilters>(
    () => ({
      q: q.trim() || undefined,
      bloodType: bloodType ?? undefined,
      city: city.trim() || undefined,
      status: status || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [q, bloodType, city, status, page],
  );

  const query = useAdminUsers(filters);
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

  const activeFilters = [q.trim(), bloodType, city.trim(), status].filter(Boolean).length;

  const clearFilters = () => {
    setQ('');
    setBloodType(null);
    setCity('');
    setStatus('');
    setPage(0);
  };

  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = page * PAGE_SIZE + rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell
      nav="users"
      title="Donors"
      subtitle="Every account, including signups that never finished a profile. Open one to see its history and act on it.">
      <Toolbar>
        <SearchField
          value={q}
          onChange={onFilterChange(setQ)}
          placeholder="Name, email, or phone"
          accessibilityLabel="Search donors by name, email, or phone"
          grow
        />
        <BloodTypeFilter
          value={bloodType}
          onChange={onFilterChange<BloodType | null>(setBloodType)}
        />
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={onFilterChange(setStatus)}
        />
        <SearchField
          value={city}
          onChange={onFilterChange(setCity)}
          placeholder="Filter by city"
          accessibilityLabel="Filter donors by city"
        />
        <ClearFilters count={activeFilters} onPress={clearFilters} />
      </Toolbar>

      <DonorGrid
        query={query}
        rows={rows}
        onOpen={(id) => router.push({ pathname: '/admin/users/[id]', params: { id } })}
      />

      {!query.isPending && !query.isError && total > 0 ? (
        <View style={styles.pagerRow}>
          <ThemedText type="footnote" color="textSecondary">
            Showing {first}–{last} of {total}
          </ThemedText>
          <Pager page={page} pageCount={pageCount} onChange={setPage} />
        </View>
      ) : null}
    </AdminShell>
  );
}

/**
 * The grid's four states. `DataTable` owned these for every other console list;
 * a grid has to carry them itself, and PATTERNS.md requires all four — so they
 * live in one component rather than as branches scattered through the screen.
 */
function DonorGrid({
  query,
  rows,
  onOpen,
}: {
  query: ReturnType<typeof useAdminUsers>;
  rows: AdminDonor[];
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();

  if (query.isError) {
    return (
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load donors"
          subtitle="The console could not reach the server. Nothing has changed — check your connection and try again."
          actionLabel="Try again"
          onAction={() => void query.refetch()}
        />
      </View>
    );
  }

  if (query.isPending) {
    return (
      <CardGrid>
        {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
          // Shaped like the cards it is standing in for, not a spinner.
          <View
            key={`skeleton-${i}`}
            style={[
              styles.skeletonCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <View style={styles.skeletonHead}>
              <Skeleton width={48} height={48} radius={Radius.full} />
              <View style={styles.skeletonLines}>
                <Skeleton width="70%" height={14} />
                <Skeleton width="30%" height={12} />
              </View>
            </View>
            <Skeleton width="85%" height={12} />
            <Skeleton width="60%" height={12} />
            <Skeleton width={72} height={20} radius={Radius.full} />
          </View>
        ))}
      </CardGrid>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <EmptyState
          icon="people-outline"
          title="No accounts match this search"
          subtitle="Try part of a name or email, or clear the filters to see everyone."
        />
      </View>
    );
  }

  return (
    <CardGrid>
      {rows.map((donor) => (
        <DonorCard key={donor.id} donor={donor} onOpen={() => onOpen(donor.id)} />
      ))}
    </CardGrid>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
  },
  skeletonCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  skeletonHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  skeletonLines: { flex: 1, gap: Spacing.sm },

  pagerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
});
