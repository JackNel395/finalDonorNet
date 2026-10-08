/**
 * /admin/centers — donation centers, and the drawer that creates or edits one.
 *
 * Until now `scripts/seed.ts` was the only writer of this table, so adding a
 * center meant a developer with database access. A center created here appears
 * in the donor app's center list and as a bookable option immediately.
 *
 * Adding and editing open `CenterForm` in the console's right-edge `Drawer`
 * rather than a centered web modal (`PATTERNS.md`), so the table stays where it
 * is behind it. Deleting is refused by the server while bookings exist, and the
 * copy points at `openNow` as the safe alternative.
 *
 * The list is one panel: heading and primary action above it, filters along its
 * top edge, rows inside, pager beneath. Filtering happens on the client because
 * `/api/admin/centers` returns the whole table unpaginated — there are tens of
 * centers, not thousands, and a round trip per keystroke would buy nothing.
 * Paging is client-side for the same reason, and the pager hides itself when
 * everything fits on one page rather than drawing a permanently dead "1".
 *
 * Web-only; see centers-list.native.tsx.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ConfirmPanel } from '@/components/admin/confirm-panel';
import { CenterForm } from '@/components/admin/center-form';
import { PageHeading } from '@/components/admin/page-heading';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { Pager, SearchField, Select, Toolbar } from '@/components/admin/toolbar';
import { ThemedText } from '@/components/themed-text';
import { Badge, BloodTypeGlyph, Button, Card, useToast } from '@/components/ui';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Radius, Spacing } from '@/constants/theme';
import { useAdminCenters, useDeleteCenter } from '@/hooks/api/admin/use-admin-centers';
import { useTheme } from '@/hooks/use-theme';
import { distanceLabel } from '@/lib/format';
import type { AdminCenter } from '@/types/api';
import type { DonationCenter } from '@/types/domain';

const KIND_LABEL: Record<DonationCenter['kind'], string> = {
  hospital: 'Hospital',
  blood_bank: 'Blood bank',
  campaign: 'Campaign',
};

/** The thumbnail says what kind of place this is without spending a column. */
const KIND_ICON: Record<DonationCenter['kind'], keyof typeof Ionicons.glyphMap> = {
  hospital: 'medkit-outline',
  blood_bank: 'water-outline',
  campaign: 'megaphone-outline',
};

const KIND_TINT: Record<DonationCenter['kind'], { fg: 'info' | 'brand' | 'warning'; bg: 'infoSubtle' | 'brandSubtle' | 'warningSubtle' }> = {
  hospital: { fg: 'info', bg: 'infoSubtle' },
  blood_bank: { fg: 'brand', bg: 'brandSubtle' },
  campaign: { fg: 'warning', bg: 'warningSubtle' },
};

/**
 * Status filter. Defaults to showing everything: a list that silently starts
 * filtered teaches operators the table is shorter than it is.
 */
type StatusFilter = '' | 'open' | 'closed';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Open now', value: 'open' },
  { label: 'Closed', value: 'closed' },
];

const PAGE_SIZE = 10;

export function AdminCentersList() {
  return <AdminGate>{() => <CentersScreen />}</AdminGate>;
}

function CentersScreen() {
  const theme = useTheme();
  const toast = useToast();
  const query = useAdminCenters();
  const deleteCenter = useDeleteCenter();

  /**
   * The drawer: whether it is open, the center it edits (null to add one), and
   * a per-opening key so each opening starts from that center's saved values.
   * Closing only flips `open`, so the panel keeps its contents while it slides
   * out.
   */
  const [drawer, setDrawer] = useState<{ open: boolean; center: AdminCenter | null; key: number }>(
    { open: false, center: null, key: 0 },
  );
  const [pendingDelete, setPendingDelete] = useState<AdminCenter | null>(null);

  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(0);

  const all = useMemo(() => query.data ?? [], [query.data]);
  const state: DataTableState = query.isPending ? 'loading' : query.isError ? 'error' : 'ready';

  // The city list is built from the rows actually loaded, so it can never offer
  // a filter that matches nothing.
  const cityOptions = useMemo(() => {
    const names = [...new Set(all.map((c) => c.city))].sort((a, b) => a.localeCompare(b));
    return [{ label: 'All cities', value: '' }, ...names.map((n) => ({ label: n, value: n }))];
  }, [all]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((c) => {
      if (city && c.city !== city) return false;
      if (status === 'open' && !c.openNow) return false;
      if (status === 'closed' && c.openNow) return false;
      if (!term) return true;
      // One box over the three things an operator has to hand: a name, a city,
      // or a street from an address they were given on the phone.
      return (
        c.name.toLowerCase().includes(term) ||
        c.city.toLowerCase().includes(term) ||
        c.address.toLowerCase().includes(term)
      );
    });
  }, [all, search, city, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A filter that shortens the list can strand the viewer past the last page.
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const resetPage = () => setPage(0);

  const busy = deleteCenter.isPending;

  const openDrawer = (center: AdminCenter | null) =>
    setDrawer((d) => ({ open: true, center, key: d.key + 1 }));

  /** ConfirmPanel has no busy state, so callers close first, then mutate. */
  const confirmDelete = () => {
    const center = pendingDelete;
    setPendingDelete(null);
    if (!center) return;
    deleteCenter.mutate(center.id, {
      onSuccess: () => toast.show(`${center.name} was removed.`, 'warning'),
      // The server refuses with a 409 naming the bookings and pointing at
      // "Open now"; that message is more specific than anything written here.
      onError: (err) => toast.show(err.message, 'danger'),
    });
  };

  const columns: DataTableColumn<AdminCenter>[] = [
    {
      key: 'center',
      header: 'Center name',
      width: 300,
      grow: 3,
      render: (c) => <CenterCell center={c} />,
    },
    {
      key: 'location',
      header: 'Location',
      width: 160,
      grow: 1,
      render: (c) => (
        <View style={styles.stack}>
          <ThemedText type="subhead" numberOfLines={1}>
            {c.city}
          </ThemedText>
          <ThemedText type="footnote" color="textTertiary" numberOfLines={1}>
            {c.latitude != null ? distanceLabel(c.distanceKm) : 'No coordinates'}
          </ThemedText>
        </View>
      ),
    },
    {
      // The mockup's "Contact" slot. Centers carry no phone number, so this
      // shows the thing an operator actually rings about instead of a field
      // that does not exist.
      key: 'hours',
      header: 'Hours',
      width: 170,
      grow: 1,
      render: (c) => (
        <ThemedText type="subhead" color="textSecondary" numberOfLines={2}>
          {c.hours}
        </ThemedText>
      ),
    },
    {
      key: 'urgent',
      header: 'Urgent need',
      width: 120,
      grow: 0,
      render: (c) =>
        c.needsUrgent?.length ? (
          <View style={styles.urgentRow}>
            {c.needsUrgent.map((t) => (
              <BloodTypeGlyph key={t} type={t} size="sm" />
            ))}
          </View>
        ) : (
          <ThemedText type="footnote" color="textTertiary">
            None
          </ThemedText>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      grow: 0,
      render: (c) => (
        <View style={styles.stack}>
          <Badge label={c.openNow ? 'Open now' : 'Closed'} tone={c.openNow ? 'success' : 'neutral'} />
          {c.upcomingAppointments > 0 ? (
            <ThemedText type="footnote" color="textTertiary" numberOfLines={1}>
              {c.upcomingAppointments} booked
            </ThemedText>
          ) : null}
        </View>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 150,
      grow: 0,
      align: 'right',
      render: (c) => (
        <View style={styles.rowActions}>
          <Button
            label="Edit"
            variant="secondary"
            size="sm"
            disabled={busy}
            accessibilityLabel={`Edit ${c.name}`}
            onPress={() => openDrawer(c)}
          />
          <RowMenu
            label={`More actions for ${c.name}`}
            disabled={busy}
            onDelete={() => setPendingDelete(c)}
          />
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      nav="centers"
      title="Centers"
      subtitle="Manage blood donation centers and their details."
      showTitle={false}>
      <PageHeading
        title="Centers"
        subtitle="Manage blood donation centers and their details."
        actions={
          <Button
            label="Add center"
            icon="add"
            onPress={() => openDrawer(null)}
            style={{ boxShadow: `0 8px 20px ${theme.brandGlow}` } as ViewStyle}
          />
        }
      />

      <Card padding={0} radius="lg" style={styles.panel}>
        <View style={styles.panelToolbar}>
          <Toolbar>
            <SearchField
              value={search}
              onChange={(v) => {
                setSearch(v);
                resetPage();
              }}
              placeholder="Search center name or location..."
              accessibilityLabel="Search centers by name, city, or address"
              grow
            />
            <Select
              label="Region"
              options={cityOptions}
              value={city}
              onChange={(v) => {
                setCity(v);
                resetPage();
              }}
            />
            <Select
              label="Status"
              options={STATUS_FILTERS}
              value={status}
              onChange={(v) => {
                setStatus(v);
                resetPage();
              }}
            />
          </Toolbar>
        </View>

        <DataTable
          variant="outline"
          columns={columns}
          rows={rows}
          keyExtractor={(c) => c.id}
          state={state}
          emptyTitle={all.length ? 'No center matches these filters' : 'No centers yet'}
          emptySubtitle={
            all.length
              ? 'Try a different city or status, or clear the search box.'
              : 'Add a center and it becomes bookable in the donor app straight away.'
          }
          errorTitle="Could not load centers"
          errorSubtitle="The console could not reach the server. Nothing has changed — check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      </Card>

      <View style={styles.pagerRow}>
        <Pager page={safePage} pageCount={pageCount} onChange={setPage} />
      </View>

      <ConfirmPanel
        visible={pendingDelete != null}
        destructive
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete this center?'}
        message={
          pendingDelete
            ? `It stops being bookable and its past appointments are removed with it. If donors have upcoming bookings here, this is refused — turn "Open now" off instead to take it out of circulation.`
            : undefined
        }
        confirmLabel="Delete center"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* An overlay, so it is last in the tree and costs the page no height
          while it is closed. */}
      <CenterForm
        key={drawer.key}
        visible={drawer.open}
        center={drawer.center}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
      />
    </AdminShell>
  );
}

/**
 * Thumbnail, name, address. The urgent-need glyphs get their own column rather
 * than a third line here: they are present on some centers and not others, and
 * a cell that grows only sometimes gives the table a ragged left edge.
 */
function CenterCell({ center }: { center: AdminCenter }) {
  const theme = useTheme();
  const tint = KIND_TINT[center.kind];

  return (
    <View style={styles.centerCell}>
      <View
        style={[styles.thumb, { backgroundColor: theme[tint.bg] }]}
        accessibilityLabel={KIND_LABEL[center.kind]}>
        <Ionicons name={KIND_ICON[center.kind]} size={20} color={theme[tint.fg]} />
      </View>
      <View style={styles.centerText}>
        <ThemedText type="headline" numberOfLines={1}>
          {center.name}
        </ThemedText>
        <ThemedText type="footnote" color="textTertiary" numberOfLines={1}>
          {center.address}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * Overflow actions for one row. Delete lives here rather than beside Edit so a
 * destructive action is never the thing a mis-aimed click lands on — the row's
 * everyday action keeps the button, and the irreversible one costs a deliberate
 * second step. The confirmation sheet is still the actual guard.
 */
function RowMenu({
  label,
  disabled,
  onDelete,
}: {
  label: string;
  disabled: boolean;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.menuWrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        style={({ hovered, pressed }) => [
          styles.kebab,
          { borderColor: 'transparent' },
          hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
        ]}>
        <Ionicons
          name="ellipsis-vertical"
          size={16}
          color={disabled ? theme.textTertiary : theme.textSecondary}
        />
      </Pressable>

      {open ? (
        <>
          {/* Catches the next click anywhere so the menu closes without the
              component owning a document-level listener. */}
          <Pressable
            style={styles.backdrop as ViewStyle}
            accessibilityLabel="Close menu"
            onPress={() => setOpen(false)}
          />
          <View
            style={[
              styles.menu,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                setOpen(false);
                onDelete();
              }}
              style={({ hovered, pressed }) => [
                styles.menuItem,
                hovered || pressed ? { backgroundColor: theme.dangerSubtle } : null,
              ]}>
              <Ionicons name="trash-outline" size={15} color={theme.danger} />
              <ThemedText type="footnote" style={{ color: theme.danger }}>
                Delete center
              </ThemedText>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { overflow: 'visible' },
  // A stacking context above the table, so an open filter menu paints over the
  // rows instead of behind them — the table is a later sibling and would
  // otherwise win on document order alone. Same reason the top bar lifts itself.
  panelToolbar: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    overflow: 'visible',
    zIndex: 20,
  },
  pagerRow: { alignItems: 'center', paddingTop: Spacing.xs },

  stack: { gap: Spacing.xs },

  centerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: { flex: 1, minWidth: 0, gap: 2 },
  urgentRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs },

  rowActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  menuWrap: { position: 'relative', zIndex: 10 },
  kebab: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 },
  menu: {
    position: 'absolute',
    top: 36,
    right: 0,
    minWidth: 180,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 10px 28px rgba(22, 25, 45, 0.12)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
  },
});
