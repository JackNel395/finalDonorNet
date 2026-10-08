/**
 * One education article in the console's content grid.
 *
 * About the cover: `education_articles` stores no image — an article is a
 * title, a summary, a category, an Ionicons name, and a `text[]` of paragraphs.
 * So the cover is drawn from what the article actually has: the icon the author
 * picked, at size, on a wash of its category's tint. It reads as artwork at a
 * glance and stays honest at close range, where a stock photograph would imply
 * an asset pipeline the app does not have.
 *
 * The meta line is read time and paragraph count for the same reason. There is
 * no analytics anywhere in this app, so there is no view count to print; read
 * time is what the donor app already shows, and the paragraph count is what
 * tells staff how substantial a piece is before they open it.
 *
 * Local to src/components/admin: bound to `AdminArticle`, and the ui barrel is
 * imported by every donor screen. Web-only, like the rest of this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { CATEGORY_LABEL, CATEGORY_TONE } from '@/components/admin/article-category';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ARTICLE_ICONS, type OfferedArticleIcon } from '@/lib/article-icons';
import type { AdminArticle } from '@/types/api';

/** Cover wash and glyph colour per category, keyed to the same tones as the pill. */
const COVER_TINT = {
  info: { bg: 'infoSubtle', fg: 'info' },
  brand: { bg: 'brandSubtle', fg: 'brand' },
  success: { bg: 'successSubtle', fg: 'success' },
  warning: { bg: 'warningSubtle', fg: 'warning' },
  danger: { bg: 'dangerSubtle', fg: 'danger' },
  neutral: { bg: 'surfaceSunken', fg: 'textSecondary' },
} as const;

export function ArticleCard({
  article,
  onEdit,
  onDelete,
  disabled,
}: {
  article: AdminArticle;
  onEdit: () => void;
  onDelete: () => void;
  /** True while any article mutation is in flight. */
  disabled?: boolean;
}) {
  const theme = useTheme();
  const tone = CATEGORY_TONE[article.category];
  const tint = COVER_TINT[tone];

  // A stored icon outside the offered list renders as blank space in the donor
  // app; here it falls back to a visible marker so staff can see it needs fixing.
  const valid = (ARTICLE_ICONS as readonly string[]).includes(article.icon);
  const glyph = (valid ? article.icon : 'help-circle') as OfferedArticleIcon;

  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessibilityRole="summary">
      <View
        style={[styles.cover, { backgroundColor: theme[tint.bg] }]}
        // Decorative: the title below is the article's accessible name, so a
        // reader announcing the glyph here would only repeat the category.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Ionicons name={glyph} size={56} color={theme[tint.fg]} />
      </View>

      <View style={styles.body}>
        <Badge label={CATEGORY_LABEL[article.category]} tone={tone} />

        <ThemedText type="headline" numberOfLines={2}>
          {article.title}
        </ThemedText>
        <ThemedText type="footnote" color="textSecondary" numberOfLines={2} style={styles.summary}>
          {article.summary}
        </ThemedText>

        <View style={styles.meta}>
          <Ionicons name="time-outline" size={13} color={theme.textTertiary} />
          <ThemedText type="footnote" color="textTertiary">
            {article.minutes} min read
          </ThemedText>
          <ThemedText type="footnote" color="textTertiary">
            ·
          </ThemedText>
          <ThemedText type="footnote" color="textTertiary">
            {article.body.length} paragraph{article.body.length === 1 ? '' : 's'}
          </ThemedText>
        </View>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Button
            label="Edit"
            variant="secondary"
            size="sm"
            disabled={disabled}
            // Standalone: every card in the grid carries an identical "Edit".
            accessibilityLabel={`Edit ${article.title}`}
            onPress={onEdit}
          />
          <Button
            label="Delete"
            variant="dangerGhost"
            size="sm"
            disabled={disabled}
            accessibilityLabel={`Delete ${article.title}`}
            onPress={onDelete}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    // The cover bleeds to the card's rounded edge rather than sitting inside
    // padding, so the grid reads as a row of covers.
    overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(22, 25, 45, 0.04)',
  },
  cover: { height: 150, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, padding: Spacing.lg, gap: Spacing.sm },
  // Two lines of summary are reserved so every card's meta row and footer land
  // on the same line across a grid row, even when one summary is a short line.
  summary: { minHeight: 34 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 'auto',
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
