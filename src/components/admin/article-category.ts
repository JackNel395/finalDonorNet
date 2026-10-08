/**
 * Category presentation shared by the console's article grid and its filter.
 *
 * Shaped like `request-status.ts`: a tone always travels with a written label,
 * so a category is never carried by colour alone, and the labels are the words
 * staff and donors read rather than the enum's.
 *
 * The four tones are deliberately distinct hues — these are peer categories, not
 * a severity scale, so none of them should read as more urgent than another.
 */
import type { BadgeTone } from '@/components/ui/badge';
import type { EducationArticle } from '@/types/domain';

export type ArticleCategory = EducationArticle['category'];

export const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  eligibility: 'Eligibility',
  process: 'Process',
  health: 'Health',
  myths: 'Myths',
};

export const CATEGORY_TONE: Record<ArticleCategory, BadgeTone> = {
  eligibility: 'info',
  process: 'brand',
  health: 'success',
  myths: 'warning',
};

export const CATEGORIES: ArticleCategory[] = ['eligibility', 'process', 'health', 'myths'];
