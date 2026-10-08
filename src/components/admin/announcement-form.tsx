/**
 * The console's announcement editor — one `Drawer` for "New announcement" and
 * "Edit", opened over the announcements list.
 *
 * Anything saved here is **live immediately**: the donor home feed reads this
 * table and shows the newest row, and there is no draft state. So the form
 * says so before the button rather than after it, and nothing is saved until
 * the operator presses it.
 *
 * Validation mirrors `validateAnnouncementFields` on the server — every field
 * required, and the same length caps — so a 400 is never the first feedback.
 * The caps are shown as counters while typing, because a badge that is too
 * long is a thing you notice at character 33, not after pressing Publish.
 *
 * Web-only, like every module in this directory.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Drawer } from '@/components/admin/drawer';
import {
  charCount,
  FormField,
  FormNotice,
  FormSection,
  formStyles,
  RequiredLegend,
  useDiscardGuard,
} from '@/components/admin/form-layout';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Input, SegmentedControl, useToast } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useCreateAnnouncement, useUpdateAnnouncement } from '@/hooks/api/admin/use-admin-content';
import type { AdminAnnouncement, CreateAnnouncementBody } from '@/types/api';
import type { Announcement } from '@/types/domain';

/** The server's caps (`src/lib/server/content.ts`). */
const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_TAG = 32;

/** Tone drives the badge in the donor home feed, so it is named for meaning. */
const TONE_OPTIONS: { label: string; value: Announcement['tone'] }[] = [
  { label: 'Brand', value: 'brand' },
  { label: 'Info', value: 'info' },
  { label: 'Good news', value: 'success' },
  { label: 'Caution', value: 'warning' },
];

type FormState = { title: string; body: string; tag: string; tone: Announcement['tone'] };

const EMPTY_FORM: FormState = { title: '', body: '', tag: '', tone: 'info' };

/**
 * Mount with a fresh `key` per opening (the caller bumps one), so the starting
 * values are read once and a background refetch never resets a half-edit.
 */
export function AnnouncementForm({
  visible,
  announcement,
  onClose,
}: {
  visible: boolean;
  /** The announcement being edited; null to write a new one. */
  announcement: AdminAnnouncement | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement(announcement?.id ?? '');

  const [initial] = useState<FormState>(() =>
    announcement
      ? {
          title: announcement.title,
          body: announcement.body,
          tag: announcement.tag,
          tone: announcement.tone,
        }
      : EMPTY_FORM,
  );
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const busy = createAnnouncement.isPending || updateAnnouncement.isPending;
  const editing = announcement != null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = (Object.keys(initial) as (keyof FormState)[]).some((k) => form[k] !== initial[k]);

  const { requestClose, footer } = useDiscardGuard({
    dirty,
    busy,
    onClose,
    title: editing ? 'Discard your changes?' : 'Discard this announcement?',
    message: editing
      ? 'Donors keep seeing the saved version. What you changed here will be lost.'
      : 'Nothing has been published. What you have typed will be lost.',
  });

  const buildBody = (): CreateAnnouncementBody | null => {
    const next: Partial<Record<keyof FormState, string>> = {};
    const title = form.title.trim();
    const body = form.body.trim();
    const tag = form.tag.trim();

    if (!title) next.title = 'A title is required.';
    else if (title.length > MAX_TITLE) next.title = `Keep the title to ${MAX_TITLE} characters.`;

    if (!body) next.body = 'A message is required.';
    else if (body.length > MAX_BODY) next.body = `Keep the message to ${MAX_BODY} characters.`;

    if (!tag) next.tag = 'A badge is required — it is the label donors see on the card.';
    else if (tag.length > MAX_TAG) next.tag = `Keep the badge to ${MAX_TAG} characters.`;

    setErrors(next);
    if (Object.keys(next).length) return null;
    return { title, body, tag, tone: form.tone };
  };

  const submit = () => {
    if (busy) return;
    const body = buildBody();
    if (!body) return;

    // Only a saved announcement closes the panel; a failure keeps the text.
    if (!editing) {
      createAnnouncement.mutate(body, {
        onSuccess: (created) => {
          toast.show(`"${created.title}" is now live in the donor home feed.`, 'success');
          onClose();
        },
        onError: (err) => toast.show(err.message, 'danger'),
      });
      return;
    }
    updateAnnouncement.mutate(body, {
      onSuccess: (updated) => {
        toast.show(`"${updated.title}" updated.`, 'success');
        onClose();
      },
      onError: (err) => toast.show(err.message, 'danger'),
    });
  };

  const clearOnFocus = (key: keyof FormState) => () => {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  return (
    <>
      <Drawer
        visible={visible}
        title={editing ? 'Edit announcement' : 'New announcement'}
        description={
          editing
            ? 'Donors see these changes the next time their home feed loads.'
            : 'A notice for the donor home feed. It is published as soon as you save it.'
        }
        width={600}
        onRequestClose={requestClose}
        footer={footer(
          <>
            <Button
              label={editing ? 'Save changes' : 'Publish announcement'}
              icon="checkmark"
              loading={busy}
              disabled={busy}
              onPress={submit}
            />
            <Button label="Cancel" variant="secondary" disabled={busy} onPress={requestClose} />
          </>,
        )}>
        <RequiredLegend />

        <FormSection title="Message">
          <Input
            label="Title"
            placeholder="Blood drive this Saturday"
            value={form.title}
            onChangeText={(v) => set('title', v)}
            onFocus={clearOnFocus('title')}
            error={errors.title}
            counter={charCount(form.title, MAX_TITLE)}
            maxLength={MAX_TITLE}
            editable={!busy}
            required
          />
          <Input
            label="Message"
            placeholder="Say what is happening, where, and what a donor can do."
            value={form.body}
            onChangeText={(v) => set('body', v)}
            onFocus={clearOnFocus('body')}
            error={errors.body}
            counter={charCount(form.body, MAX_BODY)}
            maxLength={MAX_BODY}
            multiline
            // Tall enough to read a few paragraphs back before publishing.
            style={[formStyles.textArea, styles.message]}
            editable={!busy}
            required
          />
        </FormSection>

        <FormSection title="Badge">
          <Input
            label="Badge text"
            placeholder="Blood drive"
            value={form.tag}
            onChangeText={(v) => set('tag', v)}
            onFocus={clearOnFocus('tag')}
            error={errors.tag}
            hint="Two or three words. This is the label donors see on the card."
            counter={charCount(form.tag, MAX_TAG)}
            maxLength={MAX_TAG}
            editable={!busy}
            required
          />
          <FormField
            label="Tone"
            required
            hint="Tone colours the badge. The badge text carries the meaning, so keep it readable on its own.">
            <SegmentedControl
              options={TONE_OPTIONS}
              value={form.tone}
              onChange={(v) => set('tone', v)}
            />
          </FormField>
          {/* The badge exactly as the donor feed draws it: label and tone together. */}
          <View style={styles.preview}>
            <ThemedText type="footnote" color="textTertiary">
              Preview
            </ThemedText>
            <Badge label={form.tag.trim() || 'Badge text'} tone={form.tone} />
          </View>
        </FormSection>

        <FormNotice>
          {editing
            ? 'Saving updates the live announcement straight away. There is no draft.'
            : 'Publishing puts this in every donor’s home feed straight away. There is no draft — edit or remove it afterwards if something needs to change.'}
        </FormNotice>
      </Drawer>
    </>
  );
}

const styles = StyleSheet.create({
  message: { minHeight: 200 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
