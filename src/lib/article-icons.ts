/**
 * The Ionicons an education article may use.
 *
 * A curated list rather than free text, because `learn.tsx` renders the stored
 * value directly as `<Ionicons name={a.icon} />`: a name that isn't a real
 * glyph renders as **blank space** in the donor app, with no error anywhere.
 * The `?? 'book'` fallback there only catches null, not a typo.
 *
 * One list serves both sides — the server validates against it and the admin
 * editor offers it as a picker — so an invalid icon cannot be stored at all.
 * Client-safe: no server imports, so the admin UI can use it too.
 *
 * Add to this list to offer a new icon; every entry must be a real Ionicons
 * name and should read as a medical, educational, or wellbeing concept.
 */
import type { Ionicons } from '@expo/vector-icons';

export type ArticleIcon = keyof typeof Ionicons.glyphMap;

/** Offered in the editor, in this order. The first is the default. */
export const ARTICLE_ICONS = [
  'book',
  'checkmark-circle',
  'medkit',
  'nutrition',
  'sparkles',
  'water',
  'heart',
  'fitness',
  'shield-checkmark',
  'time',
  'alert-circle',
  'help-circle',
  'information-circle',
  'bandage',
  'pulse',
  'body',
  'thermometer',
  'eyedrop',
] as const satisfies readonly ArticleIcon[];

export type OfferedArticleIcon = (typeof ARTICLE_ICONS)[number];

export const DEFAULT_ARTICLE_ICON: OfferedArticleIcon = ARTICLE_ICONS[0];

export function isArticleIcon(value: unknown): value is OfferedArticleIcon {
  return typeof value === 'string' && (ARTICLE_ICONS as readonly string[]).includes(value);
}
