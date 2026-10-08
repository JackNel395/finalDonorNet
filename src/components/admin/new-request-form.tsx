/**
 * The console's "New request" composer, in a right-edge slide-over.
 *
 * Requests normally originate from donors in the app, and for a long time the
 * console had no way to create one. It does now because the situation it covers
 * is real: someone phones the desk, or walks up to it, and staff have to post
 * on their behalf. There is no separate server route for that — this submits to
 * the same `POST /api/requests` the donor form uses, owned by the signed-in
 * staff account, so the request is attributable to a person rather than to
 * "the system".
 *
 * It used to expand inline at the top of the list, which charged every operator
 * for a form almost none of them had come to use: nine fields pushed the counts
 * and the table below the fold on the screen whose job is reviewing what is
 * already posted. In a `Drawer` the list stays put and keeps its own scroll
 * position, and composing is a layer over it rather than a different page.
 *
 * Posting fans push out to every compatible donor within 50 km and cannot be
 * recalled, so it is gated the way `broadcast.tsx` is: the consequence is
 * stated on the form, and the confirm names the blood type and the city it is
 * about to reach.
 *
 * Web-only, like the rest of src/components/admin.
 */
import { useState } from 'react';

import { Drawer } from '@/components/admin/drawer';
import {
  FooterPrompt,
  FormCell,
  FormNotice,
  FormRow,
  FormSection,
  formStyles,
  RequiredLegend,
  useDiscardGuard,
} from '@/components/admin/form-layout';
import { Select } from '@/components/admin/toolbar';
import { Button, Input, useToast } from '@/components/ui';
import { useCreateRequest } from '@/hooks/api/use-requests';
import { BLOOD_TYPES, type BloodType, type Urgency } from '@/types/domain';

const BLOOD_OPTIONS = BLOOD_TYPES.map((t) => ({ label: t, value: t }));

const URGENCY_OPTIONS: { label: string; value: Urgency }[] = [
  { label: 'Critical', value: 'critical' },
  { label: 'Urgent', value: 'urgent' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Routine', value: 'routine' },
];

/** What an untouched form holds, so "has the operator typed anything?" is answerable. */
const BLANK = {
  bloodType: 'O+' as BloodType,
  units: '2',
  urgency: 'urgent' as Urgency,
  hospital: '',
  city: '',
  patientInitials: '',
  contactName: '',
  contactPhone: '',
  note: '',
};

export function NewRequestForm({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  /** Lets the list refresh itself; the donor-feed hook does not know admin keys. */
  onCreated: () => void;
}) {
  const toast = useToast();
  const create = useCreateRequest();

  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [confirming, setConfirming] = useState(false);

  const busy = create.isPending;
  const set = <K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Anything typed is worth a confirm before a stray backdrop click drops it. */
  const dirty = (Object.keys(BLANK) as (keyof typeof BLANK)[]).some((k) => form[k] !== BLANK[k]);

  const reset = () => {
    setForm(BLANK);
    setErrors({});
  };

  const close = () => {
    reset();
    onClose();
  };

  // Mid-submit, or while the post confirm is up, a close request does nothing.
  const guard = useDiscardGuard({
    dirty,
    busy: busy || confirming,
    onClose: close,
    title: 'Discard this request?',
    message:
      'Nothing has been posted and no donor has been notified. What you have typed will be lost.',
  });

  // While the post check is up, any close request — Escape, the backdrop, the
  // close button — backs out of the check, never out of the form.
  const requestClose = () => (confirming ? setConfirming(false) : guard.requestClose());

  /** Mirrors the server's own checks, so a 400 is never the first feedback. */
  const validate = () => {
    const next: Record<string, string | undefined> = {};
    if (form.hospital.trim().length < 2) next.hospital = 'Name the hospital or center.';
    if (form.city.trim().length < 2) next.city = 'A city is required — it sets who is notified.';
    if (form.contactPhone.trim().length < 6) next.contactPhone = 'A reachable number is required.';
    if (!(Number(form.units) > 0)) next.units = 'At least one unit.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = () => {
    setConfirming(false);
    const city = form.city.trim();
    create.mutate(
      {
        patientInitials: form.patientInitials.trim() || undefined,
        bloodType: form.bloodType,
        unitsNeeded: Math.max(1, Number(form.units) || 1),
        urgency: form.urgency,
        hospital: form.hospital.trim(),
        city,
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim(),
        note: form.note.trim() || undefined,
      },
      {
        // Only a committed request closes the panel and claims donors were
        // reached. A failure leaves every field exactly as typed.
        onSuccess: () => {
          toast.show(
            `Request posted. Compatible ${form.bloodType} donors near ${city} have been notified.`,
            'success',
          );
          onCreated();
          close();
        },
        onError: (err) => toast.show(err.message, 'danger'),
      },
    );
  };

  /** Shared wiring: show this field's error, and clear it once it is revisited. */
  const field = (key: string) => ({
    error: errors[key],
    editable: !busy,
    onFocus: () => {
      if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    },
  });

  return (
    <>
      <Drawer
        visible={visible}
        title="Create blood request"
        description="Post on behalf of someone who cannot use the app. It is recorded under your account."
        width={560}
        onRequestClose={requestClose}
        footer={
          confirming ? (
            // The last check before a push that cannot be recalled, asked where
            // the Post button was and naming who it is about to reach.
            <FooterPrompt
              tone="danger"
              title={`Notify ${form.bloodType} donors near ${form.city.trim() || 'this city'}?`}
              message={`This posts the request and pushes it to every compatible donor within 50 km of ${form.city.trim() || 'the city'} immediately. The push cannot be recalled.`}
              actions={
                <>
                  <Button label="Post and notify" variant="danger" icon="send" onPress={submit} />
                  <Button
                    label="Back to the form"
                    variant="secondary"
                    onPress={() => setConfirming(false)}
                  />
                </>
              }
            />
          ) : (
            guard.footer(
              <>
                <Button
                  label="Post request"
                  icon="send"
                  loading={busy}
                  // `loading` already blocks a second press; `disabled` is what
                  // reports it to a screen reader.
                  disabled={busy}
                  onPress={() => {
                    if (validate()) setConfirming(true);
                  }}
                />
                <Button label="Cancel" variant="secondary" disabled={busy} onPress={requestClose} />
              </>,
            )
          )
        }>
        <RequiredLegend />

        <FormSection title="What is needed" style={formStyles.z3}>
          <FormRow style={formStyles.z3}>
            <FormCell narrow>
              <Select
                label="Blood type"
                variant="field"
                icon="water-outline"
                options={BLOOD_OPTIONS}
                value={form.bloodType}
                onChange={(v) => set('bloodType', v)}
                tintActive={false}
                required
              />
            </FormCell>
            <FormCell narrow>
              <Select
                label="Urgency"
                variant="field"
                icon="alert-circle-outline"
                options={URGENCY_OPTIONS}
                value={form.urgency}
                onChange={(v) => set('urgency', v)}
                tintActive={false}
                required
              />
            </FormCell>
            <FormCell narrow>
              <Input
                label="Units needed"
                value={form.units}
                onChangeText={(v) => set('units', v)}
                keyboardType="number-pad"
                required
                {...field('units')}
              />
            </FormCell>
          </FormRow>
        </FormSection>

        <FormSection title="Where" style={formStyles.z2}>
          <Input
            label="Hospital"
            icon="business-outline"
            placeholder="Vicente Sotto Memorial Medical Center"
            value={form.hospital}
            onChangeText={(v) => set('hospital', v)}
            required
            {...field('hospital')}
          />
          <FormRow>
            <FormCell>
              <Input
                label="City"
                icon="location-outline"
                placeholder="Cebu City"
                value={form.city}
                onChangeText={(v) => set('city', v)}
                autoCapitalize="words"
                hint="Sets which donors are notified."
                required
                {...field('city')}
              />
            </FormCell>
            <FormCell>
              <Input
                label="Patient initials"
                placeholder="A.B."
                value={form.patientInitials}
                onChangeText={(v) => set('patientInitials', v)}
                autoCapitalize="characters"
                hint="Initials only. Never a full name."
                {...field('patientInitials')}
              />
            </FormCell>
          </FormRow>
        </FormSection>

        <FormSection title="Who to reach">
          <FormRow>
            <FormCell>
              <Input
                label="Contact name"
                placeholder="Who the donor should ask for"
                value={form.contactName}
                onChangeText={(v) => set('contactName', v)}
                autoCapitalize="words"
                {...field('contactName')}
              />
            </FormCell>
            <FormCell>
              <Input
                label="Contact phone"
                icon="call-outline"
                placeholder="+63 900 000 0000"
                value={form.contactPhone}
                onChangeText={(v) => set('contactPhone', v)}
                keyboardType="phone-pad"
                required
                {...field('contactPhone')}
              />
            </FormCell>
          </FormRow>
          <Input
            label="Note"
            placeholder="Anything a donor needs to know before travelling."
            value={form.note}
            onChangeText={(v) => set('note', v)}
            multiline
            style={formStyles.textArea}
            editable={!busy}
          />
        </FormSection>

        <FormNotice>
          Posting notifies every compatible donor within 50 km straight away, and that notification
          cannot be recalled. The request itself can be closed afterwards.
        </FormNotice>
      </Drawer>
    </>
  );
}
