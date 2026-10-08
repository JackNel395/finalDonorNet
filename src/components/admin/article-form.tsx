/**
 * The console's article editor — one `Drawer` for "New article" and "Edit",
 * opened over the article grid.
 *
 * Wider than the other console drawers (760pt against 560) because the body is
 * the long part: several paragraphs of a few sentences each read badly in a
 * narrow column, and a writer re-reading their draft should not be scrolling
 * sideways through it. On a phone it takes the whole width like every drawer.
 *
 * Two things shape this editor:
 *
 *   - `body` is a `text[]` of paragraphs and there is no markup pipeline
 *     anywhere in the app, so this is a **paragraph list**, not a rich-text
 *     field. `article/[id].tsx` renders each entry as its own block.
 *   - `icon` is a picker, not a text box. `learn.tsx` renders the stored value
 *     straight into `<Ionicons name>`, so a name that isn't a real glyph shows
 *     as blank space with no error. The list comes from `ARTICLE_ICONS`, which
 *     the server validates against too.
 *
 * Validation mirrors `validateArticleFields` on the server, caps included.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CATEGORIES, CATEGORY_LABEL } from '@/components/admin/article-category';
import { Drawer } from '@/components/admin/drawer';
import {
  charCount,
  FormCell,
  FormField,
  FormNotice,
  FormRow,
  FormSection,
  formStyles,
  RequiredLegend,
  useDiscardGuard,
} from '@/components/admin/form-layout';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, PressableScale, SegmentedControl, useToast } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useCreateArticle, useUpdateArticle } from '@/hooks/api/admin/use-admin-content';
import { useTheme } from '@/hooks/use-theme';
import { ARTICLE_ICONS, DEFAULT_ARTICLE_ICON, type OfferedArticleIcon } from '@/lib/article-icons';
import type { AdminArticle, CreateArticleBody } from '@/types/api';
import type { EducationArticle } from '@/types/domain';

/** The server's caps (`src/lib/server/content.ts`). */
const MAX_TITLE = 120;
const MAX_SUMMARY = 300;
const MAX_PARAGRAPH = 4000;
const MAX_PARAGRAPHS = 40;
const MAX_MINUTES = 120;

const CATEGORY_OPTIONS: { label: string; value: EducationArticle['category'] }[] = CATEGORIES.map(
  (value) => ({ label: CATEGORY_LABEL[value], value }),
);

type FormState = {
  title: string;
  summary: string;
  minutes: string;
  category: EducationArticle['category'];
  icon: OfferedArticleIcon;
  /** One entry per paragraph. Always has at least one box to type into. */
  paragraphs: string[];
};

type Errors = Partial<Record<Exclude<keyof FormState, 'paragraphs'> | 'body', string>> & {
  /** Per-paragraph messages, by index. */
  paragraph?: Record<number, string>;
};

const EMPTY_FORM: FormState = {
  title: '',
  summary: '',
  minutes: '3',
  category: 'eligibility',
  icon: DEFAULT_ARTICLE_ICON,
  paragraphs: [''],
};

function toForm(a: AdminArticle): FormState {
  return {
    title: a.title,
    summary: a.summary,
    minutes: String(a.minutes),
    category: a.category,
    // A stored icon outside the offered list falls back rather than breaking
    // the picker; saving then normalizes it to a valid glyph.
    icon: (ARTICLE_ICONS as readonly string[]).includes(a.icon)
      ? (a.icon as OfferedArticleIcon)
      : DEFAULT_ARTICLE_ICON,
    paragraphs: a.body.length ? [...a.body] : [''],
  };
}

function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.title === b.title &&
    a.summary === b.summary &&
    a.minutes === b.minutes &&
    a.category === b.category &&
    a.icon === b.icon &&
    a.paragraphs.length === b.paragraphs.length &&
    a.paragraphs.every((p, i) => p === b.paragraphs[i])
  );
}

/**
 * Mount with a fresh `key` per opening (the caller bumps one), so the starting
 * values are read once and a background refetch never resets a half-edit.
 */
export function ArticleForm({
  visible,
  article,
  onClose,
}: {
  visible: boolean;
  /** The article being edited; null to write a new one. */
  article: AdminArticle | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle(article?.id ?? '');

  const [initial] = useState<FormState>(() => (article ? toForm(article) : EMPTY_FORM));
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Errors>({});

  const busy = createArticle.isPending || updateArticle.isPending;
  const editing = article != null;

  const { requestClose, footer } = useDiscardGuard({
    dirty: !sameForm(form, initial),
    busy,
    onClose,
    title: editing ? 'Discard your changes?' : 'Discard this article?',
    message: editing
      ? 'The Learn tab keeps the saved version. What you changed here will be lost.'
      : 'Nothing has been published. What you have written will be lost.',
  });

  const clearError = (key: Exclude<keyof Errors, 'paragraph'>) => () => {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const buildBody = (): CreateArticleBody | null => {
    const next: Errors = {};
    const title = form.title.trim();
    const summary = form.summary.trim();

    if (!title) next.title = 'A title is required.';
    else if (title.length > MAX_TITLE) next.title = `Keep the title to ${MAX_TITLE} characters.`;

    if (!summary) next.summary = 'A summary is required — it is the card subtitle.';
    else if (summary.length > MAX_SUMMARY) {
      next.summary = `Keep the summary to ${MAX_SUMMARY} characters.`;
    }

    const minutes = Number(form.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
      next.minutes = `Read time must be a whole number of minutes, from 1 to ${MAX_MINUTES}.`;
    }

    // Blank boxes are dropped, as the server drops them: a trailing empty one
    // is the normal state of typing, not an error.
    const paragraphs = form.paragraphs.map((p) => p.trim()).filter(Boolean);
    if (!paragraphs.length) next.body = 'Write at least one paragraph.';
    else if (paragraphs.length > MAX_PARAGRAPHS) {
      next.body = `An article can have at most ${MAX_PARAGRAPHS} paragraphs.`;
    }
    const long: Record<number, string> = {};
    form.paragraphs.forEach((p, i) => {
      if (p.trim().length > MAX_PARAGRAPH) {
        long[i] = `Split this paragraph — it is over ${MAX_PARAGRAPH} characters.`;
      }
    });
    if (Object.keys(long).length) next.paragraph = long;

    setErrors(next);
    if (Object.values(next).some(Boolean)) return null;

    return { title, summary, minutes, category: form.category, icon: form.icon, body: paragraphs };
  };

  const submit = () => {
    if (busy) return;
    const body = buildBody();
    if (!body) return;

    // Only a saved article closes the panel; a failure keeps every paragraph.
    if (!editing) {
      createArticle.mutate(body, {
        onSuccess: (created) => {
          toast.show(`"${created.title}" is now readable in the Learn tab.`, 'success');
          onClose();
        },
        onError: (err) => toast.show(err.message, 'danger'),
      });
      return;
    }
    updateArticle.mutate(body, {
      onSuccess: (updated) => {
        toast.show(`"${updated.title}" updated.`, 'success');
        onClose();
      },
      onError: (err) => toast.show(err.message, 'danger'),
    });
  };

  const setParagraph = (index: number, value: string) =>
    setForm((f) => ({
      ...f,
      paragraphs: f.paragraphs.map((p, i) => (i === index ? value : p)),
    }));

  const addParagraph = () => setForm((f) => ({ ...f, paragraphs: [...f.paragraphs, ''] }));

  const removeParagraph = (index: number) => {
    setForm((f) => {
      const next = f.paragraphs.filter((_, i) => i !== index);
      // Always leave one box, so the editor never becomes untypeable.
      return { ...f, paragraphs: next.length ? next : [''] };
    });
    // Indices shift on removal, so per-paragraph messages no longer line up.
    setErrors((e) => ({ ...e, paragraph: undefined }));
  };

  return (
    <>
      <Drawer
        visible={visible}
        title={editing ? 'Edit article' : 'New article'}
        description="Learning material for the donor Learn tab. It is published as soon as you save it."
        width={760}
        onRequestClose={requestClose}
        footer={footer(
          <>
            <Button
              label={editing ? 'Save changes' : 'Publish article'}
              icon="checkmark"
              loading={busy}
              disabled={busy}
              onPress={submit}
            />
            <Button label="Cancel" variant="secondary" disabled={busy} onPress={requestClose} />
          </>,
        )}>
        <RequiredLegend />

        <FormSection title="The card">
          <Input
            label="Title"
            placeholder="Who can donate blood?"
            value={form.title}
            onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
            onFocus={clearError('title')}
            error={errors.title}
            counter={charCount(form.title, MAX_TITLE)}
            maxLength={MAX_TITLE}
            editable={!busy}
            required
          />
          <Input
            label="Summary"
            placeholder="One sentence shown under the title on the Learn card."
            value={form.summary}
            onChangeText={(v) => setForm((f) => ({ ...f, summary: v }))}
            onFocus={clearError('summary')}
            error={errors.summary}
            counter={charCount(form.summary, MAX_SUMMARY)}
            maxLength={MAX_SUMMARY}
            multiline
            style={formStyles.textArea}
            editable={!busy}
            required
          />
          <FormRow>
            <View style={styles.categoryCell}>
              <FormField label="Category" required>
                <SegmentedControl
                  options={CATEGORY_OPTIONS}
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                />
              </FormField>
            </View>
            <FormCell narrow>
              <Input
                label="Read time"
                placeholder="3"
                value={form.minutes}
                onChangeText={(v) => setForm((f) => ({ ...f, minutes: v }))}
                onFocus={clearError('minutes')}
                error={errors.minutes}
                keyboardType="number-pad"
                hint="Minutes, shown on the card."
                editable={!busy}
                required
              />
            </FormCell>
          </FormRow>
          <IconPicker
            value={form.icon}
            onChange={(icon) => setForm((f) => ({ ...f, icon }))}
            disabled={busy}
          />
        </FormSection>

        <FormSection title="Body">
          <ThemedText type="footnote" color="textTertiary">
            Write in short paragraphs. Each one becomes its own block in the donor app; empty boxes
            are left out.
          </ThemedText>
          {errors.body ? (
            <ThemedText type="footnote" color="danger">
              {errors.body}
            </ThemedText>
          ) : null}
          {form.paragraphs.map((para, i) => (
            <View key={`para-${i}`} style={styles.paragraphRow}>
              <View style={styles.paragraphInput}>
                <Input
                  label={`Paragraph ${i + 1}`}
                  placeholder="One idea per paragraph."
                  value={para}
                  onChangeText={(v) => {
                    setParagraph(i, v);
                    if (errors.body || errors.paragraph?.[i]) {
                      setErrors((e) => ({ ...e, body: undefined, paragraph: undefined }));
                    }
                  }}
                  error={errors.paragraph?.[i]}
                  counter={
                    para.trim().length > MAX_PARAGRAPH * 0.8
                      ? charCount(para, MAX_PARAGRAPH)
                      : undefined
                  }
                  multiline
                  style={[formStyles.textArea, styles.paragraph]}
                  editable={!busy}
                  required={i === 0}
                />
              </View>
              <Button
                label="Remove"
                variant="secondary"
                size="sm"
                accessibilityLabel={`Remove paragraph ${i + 1}`}
                disabled={busy || (form.paragraphs.length === 1 && !para.trim())}
                onPress={() => removeParagraph(i)}
              />
            </View>
          ))}
          <View style={styles.addRow}>
            <Button
              label="Add paragraph"
              variant="secondary"
              size="sm"
              icon="add"
              disabled={busy || form.paragraphs.length >= MAX_PARAGRAPHS}
              onPress={addParagraph}
            />
            <ThemedText type="footnote" color="textTertiary">
              {form.paragraphs.length} of {MAX_PARAGRAPHS}
            </ThemedText>
          </View>
        </FormSection>

        <FormNotice>
          {editing
            ? 'Saving updates the article in the Learn tab straight away. There is no draft.'
            : 'Publishing makes this readable in every donor’s Learn tab straight away. There is no draft — edit or remove it afterwards if something needs to change.'}
        </FormNotice>
      </Drawer>
    </>
  );
}

/**
 * A picker rather than a text field, because an invalid Ionicons name renders
 * as blank space in the donor app with no error anywhere. Selection is carried
 * by a border and `accessibilityState.selected`, never by colour alone.
 */
function IconPicker({
  value,
  onChange,
  disabled,
}: {
  value: OfferedArticleIcon;
  onChange: (icon: OfferedArticleIcon) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <FormField label="Icon" required hint="Shown on the article's card in the Learn tab.">
      <View style={styles.iconRow}>
        {ARTICLE_ICONS.map((icon) => {
          const selected = value === icon;
          return (
            <PressableScale
              key={icon}
              onPress={() => onChange(icon)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`Use the ${icon.replace(/-/g, ' ')} icon`}
              style={[
                styles.iconTarget,
                {
                  backgroundColor: selected ? theme.brandSubtle : theme.surfaceSunken,
                  borderColor: selected ? theme.brand : 'transparent',
                },
              ]}>
              <Ionicons
                name={icon}
                size={20}
                color={selected ? theme.brand : theme.textSecondary}
              />
            </PressableScale>
          );
        })}
      </View>
    </FormField>
  );
}

const styles = StyleSheet.create({
  // The segmented control needs the room; read time takes what is left.
  categoryCell: { flex: 3, minWidth: 280 },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  // 44pt target, per the interaction rules.
  iconTarget: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paragraphRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  paragraphInput: { flex: 1, minWidth: 0 },
  paragraph: { minHeight: 120 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
