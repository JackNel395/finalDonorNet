/**
 * /admin/content — announcements, and the drawer that writes one.
 *
 * Anything saved here is **live immediately**: the donor home feed reads this
 * table and shows the newest row. There is no draft state, so the copy says so
 * before staff press the button rather than after.
 *
 * Writing and editing open `AnnouncementForm` in the console's right-edge
 * `Drawer`, the same layer the requests list uses, rather than a centered web
 * modal (`DESIGN_PRINCIPLES.md`) — the list stays in place behind it.
 *
 * Web-only; see content-announcements.native.tsx.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmPanel } from '@/components/admin/confirm-panel';
import { AnnouncementForm } from '@/components/admin/announcement-form';
import { PageHeading } from '@/components/admin/page-heading';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, useToast } from '@/components/ui';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Spacing } from '@/constants/theme';
import {
  useAdminAnnouncements,
  useDeleteAnnouncement,
} from '@/hooks/api/admin/use-admin-content';
import { longDate } from '@/lib/format';
import type { AdminAnnouncement } from '@/types/api';

export function AdminAnnouncements() {
  return <AdminGate>{() => <AnnouncementsScreen />}</AdminGate>;
}

function AnnouncementsScreen() {
  const toast = useToast();
  const query = useAdminAnnouncements();
  const deleteAnnouncement = useDeleteAnnouncement();

  /**
   * The drawer: open or not, the announcement it edits (null to write one), and
   * a per-opening key so each opening starts from the saved text. Closing only
   * flips `open`, so the panel keeps its contents while it slides out.
   */
  const [drawer, setDrawer] = useState<{
    open: boolean;
    announcement: AdminAnnouncement | null;
    key: number;
  }>({ open: false, announcement: null, key: 0 });
  const [pendingDelete, setPendingDelete] = useState<AdminAnnouncement | null>(null);

  const busy = deleteAnnouncement.isPending;

  const rows = query.data ?? [];
  const state: DataTableState = query.isPending ? 'loading' : query.isError ? 'error' : 'ready';

  const openDrawer = (announcement: AdminAnnouncement | null) =>
    setDrawer((d) => ({ open: true, announcement, key: d.key + 1 }));

  /** ConfirmPanel has no busy state, so callers close first, then mutate. */
  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    deleteAnnouncement.mutate(target.id, {
      onSuccess: () => toast.show(`"${target.title}" was removed from the feed.`, 'warning'),
      onError: (err) => toast.show(err.message, 'danger'),
    });
  };

  const columns: DataTableColumn<AdminAnnouncement>[] = [
    {
      key: 'date',
      header: 'Published',
      width: 150,
      render: (a) => <ThemedText type="subhead">{longDate(a.date)}</ThemedText>,
    },
    {
      key: 'title',
      header: 'Announcement',
      width: 280,
      render: (a) => (
        <View style={styles.stack}>
          <ThemedText type="headline">{a.title}</ThemedText>
          <ThemedText type="footnote" color="textSecondary" numberOfLines={2}>
            {a.body}
          </ThemedText>
        </View>
      ),
    },
    {
      key: 'tag',
      header: 'Badge',
      width: 150,
      // The tone travels with its label, exactly as the donor feed renders it —
      // never tone alone.
      render: (a) => <Badge label={a.tag} tone={a.tone} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 180,
      render: (a) => (
        <View style={styles.rowActions}>
          <Button
            label="Edit"
            variant="secondary"
            size="sm"
            disabled={busy}
            accessibilityLabel={`Edit "${a.title}"`}
            onPress={() => openDrawer(a)}
          />
          <Button
            label="Delete"
            variant="danger"
            size="sm"
            disabled={busy}
            accessibilityLabel={`Delete "${a.title}"`}
            onPress={() => setPendingDelete(a)}
          />
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      nav="announcements"
      title="Announcements"
      subtitle="Notices in the donor home feed. Saving publishes immediately — there is no draft."
      showTitle={false}>
      <PageHeading
        title="Announcements"
        subtitle="Notices in the donor home feed. Saving publishes immediately — there is no draft."
        actions={<Button label="New announcement" icon="add" onPress={() => openDrawer(null)} />}
      />

      <DataTable
        columns={columns}
        rows={rows}
        keyExtractor={(a) => a.id}
        state={state}
        emptyTitle="No announcements yet"
        emptySubtitle="Publish one and it appears in every donor's home feed."
        errorTitle="Could not load announcements"
        errorSubtitle="The console could not reach the server. Nothing has changed — check your connection and try again."
        onRetry={() => void query.refetch()}
      />

      <ConfirmPanel
        visible={pendingDelete != null}
        destructive
        title={pendingDelete ? `Remove "${pendingDelete.title}"?` : 'Remove this announcement?'}
        message="It disappears from every donor's home feed. The text is kept in the audit trail, but the announcement itself cannot be restored from here."
        confirmLabel="Remove it"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* An overlay, so it is last in the tree and costs the page no height
          while it is closed. */}
      <AnnouncementForm
        key={drawer.key}
        visible={drawer.open}
        announcement={drawer.announcement}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
      />
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 2 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});
