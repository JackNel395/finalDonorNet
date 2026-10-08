/**
 * /admin/articles — education articles, and the drawer that writes one.
 *
 * The grid is the page; writing and editing open `ArticleForm` in the
 * console's right-edge `Drawer` (wider than the others, for the paragraph
 * editor) so the cards stay where they are behind it. See `article-form.tsx`
 * for why the body is a paragraph list and the icon a picker.
 *
 * Web-only; see content-articles.native.tsx.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmPanel } from '@/components/admin/confirm-panel';
import { ArticleCard } from '@/components/admin/article-card';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  type ArticleCategory,
} from '@/components/admin/article-category';
import { ArticleForm } from '@/components/admin/article-form';
import { CardGrid } from '@/components/admin/card-grid';
import { PageHeading } from '@/components/admin/page-heading';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ClearFilters, SearchField, Select, Toolbar } from '@/components/admin/toolbar';
import { Button, EmptyState, Skeleton, useToast } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAdminArticles, useDeleteArticle } from '@/hooks/api/admin/use-admin-content';
import { useTheme } from '@/hooks/use-theme';
import type { AdminArticle } from '@/types/api';

/** An empty string is "no filter"; `Select` needs a value to represent it. */
type CategoryChoice = '' | ArticleCategory;

const CATEGORY_FILTER_OPTIONS: { label: string; value: CategoryChoice }[] = [
  { label: 'All', value: '' },
  ...CATEGORIES.map((value) => ({ label: CATEGORY_LABEL[value], value: value as CategoryChoice })),
];

const SKELETON_CARDS = 3;

export function AdminArticles() {
  return <AdminGate>{() => <ArticlesScreen />}</AdminGate>;
}

function ArticlesScreen() {
  const toast = useToast();
  const query = useAdminArticles();
  const deleteArticle = useDeleteArticle();

  /**
   * The drawer: open or not, the article it edits (null to write one), and a
   * per-opening key so each opening starts from the saved text. Closing only
   * flips `open`, so the panel keeps its contents while it slides out.
   */
  const [drawer, setDrawer] = useState<{ open: boolean; article: AdminArticle | null; key: number }>(
    { open: false, article: null, key: 0 },
  );
  const [pendingDelete, setPendingDelete] = useState<AdminArticle | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<CategoryChoice>('');

  const busy = deleteArticle.isPending;

  const rows = useMemo(() => query.data ?? [], [query.data]);

  // Filtered on the client, like the donor Learn tab: the admin endpoint
  // returns the whole curated set unpaginated, so a round trip per keystroke
  // would buy nothing.
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((a) => {
      if (category && a.category !== category) return false;
      if (!term) return true;
      return (
        a.title.toLowerCase().includes(term) ||
        a.summary.toLowerCase().includes(term) ||
        a.body.some((p) => p.toLowerCase().includes(term))
      );
    });
  }, [rows, q, category]);

  const activeFilters = [q.trim(), category].filter(Boolean).length;

  const clearFilters = () => {
    setQ('');
    setCategory('');
  };

  const openDrawer = (article: AdminArticle | null) =>
    setDrawer((d) => ({ open: true, article, key: d.key + 1 }));

  /** ConfirmPanel has no busy state, so callers close first, then mutate. */
  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    deleteArticle.mutate(target.id, {
      onSuccess: () => toast.show(`"${target.title}" was removed from Learn.`, 'warning'),
      onError: (err) => toast.show(err.message, 'danger'),
    });
  };

  return (
    <AdminShell
      nav="articles"
      title="Articles"
      subtitle="Learning material in the donor Learn tab. Saving publishes immediately."
      showTitle={false}>
      <PageHeading
        title="Articles"
        subtitle="Learning material in the donor Learn tab. Saving publishes immediately."
        actions={<Button label="New article" icon="add" onPress={() => openDrawer(null)} />}
      />

      <Toolbar>
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search articles…"
          accessibilityLabel="Search articles by title, summary, or text"
          grow
        />
        <Select
          label="Category"
          options={CATEGORY_FILTER_OPTIONS}
          value={category}
          onChange={setCategory}
        />
        <ClearFilters count={activeFilters} onPress={clearFilters} />
      </Toolbar>

      <ArticleGrid
        query={query}
        articles={visible}
        filtered={activeFilters > 0}
        busy={busy}
        onEdit={openDrawer}
        onDelete={setPendingDelete}
        onClearFilters={clearFilters}
      />

      <ConfirmPanel
        visible={pendingDelete != null}
        destructive
        title={pendingDelete ? `Remove "${pendingDelete.title}"?` : 'Remove this article?'}
        message="It disappears from the Learn tab. The full text is kept in the audit trail, but the article itself cannot be restored from here."
        confirmLabel="Remove it"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* An overlay, so it is last in the tree and costs the page no height
          while it is closed. */}
      <ArticleForm
        key={drawer.key}
        visible={drawer.open}
        article={drawer.article}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
      />
    </AdminShell>
  );
}

/**
 * The grid's four states. `DataTable` owned these while this screen was a
 * table; a grid has to carry them itself, and PATTERNS.md requires all four.
 *
 * "No articles yet" and "nothing matches your filters" are different situations
 * with different next steps, so they are different empties — the first invites
 * publishing, the second offers to widen the search.
 */
function ArticleGrid({
  query,
  articles,
  filtered,
  busy,
  onEdit,
  onDelete,
  onClearFilters,
}: {
  query: ReturnType<typeof useAdminArticles>;
  articles: AdminArticle[];
  /** True when a filter is narrowing the list, which changes the empty copy. */
  filtered: boolean;
  busy: boolean;
  onEdit: (article: AdminArticle) => void;
  onDelete: (article: AdminArticle) => void;
  onClearFilters: () => void;
}) {
  const theme = useTheme();

  if (query.isError) {
    return (
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load articles"
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
          // Shaped like the cards it stands in for, cover band included.
          <View
            key={`skeleton-${i}`}
            style={[
              styles.skeletonCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Skeleton width="100%" height={150} radius={0} />
            <View style={styles.skeletonBody}>
              <Skeleton width={84} height={20} radius={Radius.full} />
              <Skeleton width="80%" height={16} />
              <Skeleton width="100%" height={12} />
              <Skeleton width="55%" height={12} />
            </View>
          </View>
        ))}
      </CardGrid>
    );
  }

  if (articles.length === 0) {
    return (
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {filtered ? (
          <EmptyState
            icon="search-outline"
            title="No articles match these filters"
            subtitle="Try a different word, or show every category again."
            actionLabel="Clear filters"
            onAction={onClearFilters}
          />
        ) : (
          <EmptyState
            icon="book-outline"
            title="No articles yet"
            subtitle="Publish one and it appears in the donor Learn tab."
          />
        )}
      </View>
    );
  }

  return (
    <CardGrid>
      {articles.map((article) => (
        <ArticleCard
          key={article.id}
          article={article}
          disabled={busy}
          onEdit={() => onEdit(article)}
          onDelete={() => onDelete(article)}
        />
      ))}
    </CardGrid>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg },
  skeletonCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  skeletonBody: { padding: Spacing.lg, gap: Spacing.sm },
});
