/**
 * The console's center editor — one `Drawer` for both "Add center" and "Edit",
 * opened over the centers list.
 *
 * It used to expand inline above the list, where ten fields pushed the table
 * the operator came to manage off the screen. In the drawer the list stays put,
 * and editing reads as a layer over it rather than a different page.
 *
 * Validation mirrors `validateCenterFields` on the server, so a 400 is never
 * the first feedback: name, address, city and hours are required, a rating is
 * 0–5, and coordinates are all-or-nothing — half a pair would look like a
 * stored location while silently using the city fallback.
 *
 * Web-only, like every module in this directory.
 */
import { useState } from 'react';

import { BloodTypeFilter } from '@/components/admin/blood-type-filter';
import { Drawer } from '@/components/admin/drawer';
import {
  FormCell,
  FormField,
  FormNotice,
  FormRow,
  FormSection,
  RequiredLegend,
  useDiscardGuard,
} from '@/components/admin/form-layout';
import { Button, Input, SegmentedControl, useToast } from '@/components/ui';
import { useCreateCenter, useUpdateCenter } from '@/hooks/api/admin/use-admin-centers';
import type { AdminCenter, CreateCenterBody } from '@/types/api';
import type { BloodType, DonationCenter } from '@/types/domain';

const KIND_OPTIONS: { label: string; value: DonationCenter['kind'] }[] = [
  { label: 'Hospital', value: 'hospital' },
  { label: 'Blood bank', value: 'blood_bank' },
  { label: 'Campaign', value: 'campaign' },
];

type OpenChoice = 'open' | 'closed';

const OPEN_OPTIONS: { label: string; value: OpenChoice }[] = [
  { label: 'Open now', value: 'open' },
  { label: 'Closed', value: 'closed' },
];

/** The form's own state, all strings — it is a text form until it validates. */
type FormState = {
  name: string;
  kind: DonationCenter['kind'];
  address: string;
  city: string;
  hours: string;
  rating: string;
  openNow: OpenChoice;
  latitude: string;
  longitude: string;
  needsUrgent: BloodType | null;
};

const EMPTY_FORM: FormState = {
  name: '',
  kind: 'hospital',
  address: '',
  city: '',
  hours: '',
  rating: '',
  openNow: 'open',
  latitude: '',
  longitude: '',
  needsUrgent: null,
};

function toForm(center: AdminCenter): FormState {
  return {
    name: center.name,
    kind: center.kind,
    address: center.address,
    city: center.city,
    hours: center.hours,
    rating: String(center.rating),
    openNow: center.openNow ? 'open' : 'closed',
    latitude: center.latitude != null ? String(center.latitude) : '',
    longitude: center.longitude != null ? String(center.longitude) : '',
    // v1 edits a single urgent type; the column is an array, so it round-trips
    // as a one-element list rather than pretending to support more.
    needsUrgent: center.needsUrgent?.[0] ?? null,
  };
}

/**
 * Mount with a fresh `key` per opening (the caller bumps one), so the form's
 * starting values are read once from `center` and never reset mid-edit by a
 * background refetch of the list.
 */
export function CenterForm({
  visible,
  center,
  onClose,
}: {
  visible: boolean;
  /** The center being edited; null to add a new one. */
  center: AdminCenter | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const createCenter = useCreateCenter();
  const updateCenter = useUpdateCenter(center?.id ?? '');

  const [initial] = useState<FormState>(() => (center ? toForm(center) : EMPTY_FORM));
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const busy = createCenter.isPending || updateCenter.isPending;
  const editing = center != null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = (Object.keys(initial) as (keyof FormState)[]).some((k) => form[k] !== initial[k]);

  const { requestClose, footer } = useDiscardGuard({
    dirty,
    busy,
    onClose,
    title: editing ? 'Discard your changes?' : 'Discard this center?',
    message: editing
      ? `${center.name} keeps its saved details. What you changed here will be lost.`
      : 'Nothing has been saved and donors see no new center. What you have typed will be lost.',
  });

  /** Validate the text form into a request body, or report what is wrong. */
  const buildBody = (): CreateCenterBody | null => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = 'A name is required.';
    if (!form.address.trim()) next.address = 'An address is required.';
    if (!form.city.trim()) next.city = 'A city is required.';
    if (!form.hours.trim()) next.hours = 'Opening hours are required.';

    let rating: number | undefined;
    if (form.rating.trim()) {
      const parsed = Number(form.rating);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) {
        next.rating = 'Rating must be a number between 0 and 5.';
      } else {
        rating = parsed;
      }
    }

    // Coordinates are all-or-nothing, matching the server: half a pair would
    // look like a stored location while silently using the city fallback.
    const latRaw = form.latitude.trim();
    const lngRaw = form.longitude.trim();
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (latRaw || lngRaw) {
      if (!latRaw || !lngRaw) {
        const message = 'Give both latitude and longitude, or leave both empty.';
        if (!latRaw) next.latitude = message;
        if (!lngRaw) next.longitude = message;
      } else {
        const lat = Number(latRaw);
        const lng = Number(lngRaw);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          next.latitude = 'Latitude must be between -90 and 90.';
        } else {
          latitude = lat;
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
          next.longitude = 'Longitude must be between -180 and 180.';
        } else {
          longitude = lng;
        }
      }
    }

    setErrors(next);
    if (Object.keys(next).length) return null;

    return {
      name: form.name.trim(),
      kind: form.kind,
      address: form.address.trim(),
      city: form.city.trim(),
      hours: form.hours.trim(),
      rating,
      openNow: form.openNow === 'open',
      latitude,
      longitude,
      needsUrgent: form.needsUrgent ? [form.needsUrgent] : null,
    };
  };

  const submit = () => {
    if (busy) return;
    const body = buildBody();
    if (!body) return;

    // Only a saved center closes the panel. A failure leaves every field as
    // typed, and the server's message names the field it refused.
    if (!editing) {
      createCenter.mutate(body, {
        onSuccess: (created) => {
          toast.show(`${created.name} is now bookable in the donor app.`, 'success');
          onClose();
        },
        onError: (err) => toast.show(err.message, 'danger'),
      });
      return;
    }
    updateCenter.mutate(body, {
      onSuccess: (updated) => {
        toast.show(`${updated.name} updated.`, 'success');
        onClose();
      },
      onError: (err) => toast.show(err.message, 'danger'),
    });
  };

  /** Shared wiring: show this field's error, and clear it once it is revisited. */
  const field = (key: keyof FormState) => ({
    value: form[key] as string,
    onChangeText: (v: string) => set(key, v as FormState[typeof key]),
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
        title={editing ? 'Edit center' : 'Add center'}
        description={
          editing
            ? 'Donors see these changes the next time their center list loads.'
            : 'It becomes bookable in the donor app as soon as it is saved.'
        }
        width={560}
        onRequestClose={requestClose}
        footer={footer(
          <>
            <Button
              label={editing ? 'Save changes' : 'Create center'}
              icon="checkmark"
              loading={busy}
              disabled={busy}
              onPress={submit}
            />
            <Button label="Cancel" variant="secondary" disabled={busy} onPress={requestClose} />
          </>,
        )}>
        <RequiredLegend />

        <FormSection title="The center">
          <Input
            label="Name"
            icon="business-outline"
            placeholder="Philippine Red Cross — Manila"
            required
            {...field('name')}
          />
          <FormField label="Kind" required>
            <SegmentedControl
              options={KIND_OPTIONS}
              value={form.kind}
              onChange={(v) => set('kind', v)}
            />
          </FormField>
        </FormSection>

        <FormSection title="Location">
          <Input
            label="Address"
            icon="location-outline"
            placeholder="Street, barangay"
            required
            {...field('address')}
          />
          <Input
            label="City"
            placeholder="Manila"
            autoCapitalize="words"
            required
            {...field('city')}
          />
          <FormRow>
            <FormCell>
              <Input
                label="Latitude"
                placeholder="14.5995"
                keyboardType="decimal-pad"
                {...field('latitude')}
              />
            </FormCell>
            <FormCell>
              <Input
                label="Longitude"
                placeholder="120.9842"
                keyboardType="decimal-pad"
                {...field('longitude')}
              />
            </FormCell>
          </FormRow>
          <FormNotice tone="info">
            Coordinates are optional, but a center without them uses a per-city estimate for
            distance. Give both or neither.
          </FormNotice>
        </FormSection>

        <FormSection title="Hours and availability">
          <Input
            label="Hours"
            icon="time-outline"
            placeholder="Mon–Sat, 8:00 AM – 5:00 PM"
            required
            {...field('hours')}
          />
          <FormField
            label="Availability"
            hint="Closed takes a center out of circulation without deleting it.">
            <SegmentedControl
              options={OPEN_OPTIONS}
              value={form.openNow}
              onChange={(v) => set('openNow', v)}
            />
          </FormField>
          <FormRow>
            <FormCell>
              <Input
                label="Rating"
                placeholder="0 to 5"
                keyboardType="decimal-pad"
                hint="Leave empty for no rating."
                {...field('rating')}
              />
            </FormCell>
            <FormCell>
              <BloodTypeFilter
                label="Urgent need"
                variant="field"
                icon="water-outline"
                value={form.needsUrgent}
                onChange={(v) => set('needsUrgent', v)}
              />
            </FormCell>
          </FormRow>
        </FormSection>
      </Drawer>
    </>
  );
}
