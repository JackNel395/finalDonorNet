/**
 * Booking a slot on a donor's behalf — the phoned-in appointment — in the
 * console's right-edge `Drawer`, the same layer `new-request-form.tsx` opens.
 *
 * It used to expand inline above the list, which pushed the day's schedule
 * below the fold for every operator who had come to read it. In the drawer the
 * list stays put behind it, so the operator can still see what that donor
 * already has.
 *
 * The donor is chosen by searching the account list, not by pasting an id. The
 * day and slot come from the same `SLOTS` the donor app offers, so a booking
 * staff made and one the donor made are indistinguishable at the center — the
 * server stores them as the same row, and only the audit log records who made
 * it.
 *
 * Only the server decides whether the booking stands: it applies the donor
 * route's own guards — one upcoming appointment at a time, nothing in the past,
 * nothing inside the recovery window — and its 409 text is shown verbatim,
 * because the reason is specific to that donor and this screen cannot restate
 * it more accurately than the rule that refused it. The form checks only what
 * it can know for certain: that every answer is given and the slot is not
 * already over.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  DateFilter,
  dayLabel,
  dayStartISO,
  todayKey,
  type DayKey,
} from '@/components/admin/date-filter';
import { Drawer } from '@/components/admin/drawer';
import {
  FormCell,
  FormField,
  FormNotice,
  FormRow,
  FormSection,
  formStyles,
  RequiredLegend,
  useDiscardGuard,
} from '@/components/admin/form-layout';
import { Select } from '@/components/admin/toolbar';
import { ThemedText } from '@/components/themed-text';
import { Avatar, BloodTypeGlyph, Button, Input, SegmentedControl, useToast } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useCreateAdminAppointment } from '@/hooks/api/admin/use-admin-appointments';
import { useAdminUsers } from '@/hooks/api/admin/use-admin-users';
import { useTheme } from '@/hooks/use-theme';
import { DONATION_TYPE_LABEL, DONATION_TYPES, SLOTS, slotDateTime } from '@/lib/booking';
import { clockTime } from '@/lib/format';
import type { AdminCenter, AdminDonor } from '@/types/api';
import type { Donation } from '@/types/domain';

/** Enough to recognise the right person without turning the form into a list. */
const DONOR_RESULTS = 5;

const TYPE_OPTIONS: { label: string; value: Donation['type'] }[] = DONATION_TYPES.map((t) => ({
  label: DONATION_TYPE_LABEL[t],
  value: t,
}));

/** Fewer characters than this matches too much of the account list to be useful. */
const MIN_SEARCH = 2;

/**
 * The slot menu, labelled in the same clock format the table prints. Before a
 * day is picked the times are formatted against today — a slot is the same
 * wall-clock time on every day, so the label does not change once one is.
 */
function slotOptions(day: DayKey | null): { label: string; value: string }[] {
  const base = dayStartISO(day ?? todayKey());
  return SLOTS.map((slot) => ({
    label: clockTime(slotDateTime(base, slot).toISOString()),
    value: slot,
  }));
}

/** The second line under a donor's name: how staff would recognise them on the phone. */
function donorContact(d: AdminDonor): string {
  return d.phone ? `${d.email} · ${d.phone}` : d.email;
}

type Errors = Partial<Record<'donor' | 'center' | 'day', string>>;

export function NewAppointmentForm({
  visible,
  centers,
  onClose,
  onBooked,
}: {
  visible: boolean;
  centers: AdminCenter[];
  onClose: () => void;
  onBooked: () => void;
}) {
  const theme = useTheme();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [donor, setDonor] = useState<AdminDonor | null>(null);
  const [centerId, setCenterId] = useState('');
  const [day, setDay] = useState<DayKey | null>(null);
  const [slot, setSlot] = useState(SLOTS[0]);
  const [type, setType] = useState<Donation['type']>('whole');
  const [errors, setErrors] = useState<Errors>({});

  const create = useCreateAdminAppointment();
  const busy = create.isPending;

  // Only searched once there is something to search for: an unfiltered account
  // list is not a useful picker, and it is a wasted round trip per keystroke.
  const term = search.trim();
  const searching = term.length >= MIN_SEARCH;
  const results = useAdminUsers({ q: term, limit: DONOR_RESULTS }, { enabled: searching });
  const matches = results.data?.rows ?? [];

  const centerOptions = useMemo(
    () => [
      { label: 'Choose a center', value: '' },
      ...centers.map((c) => ({ label: c.name, value: c.id })),
    ],
    [centers],
  );

  const dirty = !!donor || !!term || !!centerId || !!day || slot !== SLOTS[0] || type !== 'whole';

  const { requestClose, footer } = useDiscardGuard({
    dirty,
    busy,
    onClose,
    title: 'Discard this booking?',
    message: 'Nothing has been booked yet. The donor, center and time you chose will be lost.',
  });

  const clearError = (key: keyof Errors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  /** Every required answer, and a slot that has not already started. */
  const validate = () => {
    const next: Errors = {};
    if (!donor) next.donor = 'Search for and choose the donor to book.';
    if (!centerId) next.center = 'Choose where the donation happens.';
    if (!day) {
      next.day = 'Pick the day of the visit.';
    } else if (slotDateTime(dayStartISO(day), slot).getTime() <= Date.now()) {
      // The server's own rule, checked here so the operator sees it beside the
      // field instead of in a toast after the round trip.
      next.day = 'That day and time have already passed. Pick a later slot.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = () => {
    if (busy || !validate() || !donor || !day) return;
    const when = slotDateTime(dayStartISO(day), slot);

    create.mutate(
      { donorId: donor.id, centerId, date: when.toISOString(), type },
      {
        // Only a committed booking closes the panel; a refusal leaves every
        // choice in place so the operator can change the one that was wrong.
        onSuccess: (apt) => {
          toast.show(
            `Booked ${apt.donorName} at ${apt.centerName} on ${dayLabel(day)}, ${clockTime(apt.date)}.`,
            'success',
          );
          onBooked();
        },
        // The server's message is the specific one — which donor already holds
        // a booking, or whose recovery window this lands in.
        onError: (err) => toast.show(err.message, 'danger'),
      },
    );
  };

  return (
    <>
      <Drawer
        visible={visible}
        title="New appointment"
        description="Book a slot on a donor's behalf. It is live in their app straight away."
        width={560}
        onRequestClose={requestClose}
        footer={footer(
          <>
            <Button
              label="Book appointment"
              icon="calendar"
              loading={busy}
              disabled={busy}
              onPress={submit}
            />
            <Button label="Cancel" variant="secondary" disabled={busy} onPress={requestClose} />
          </>,
        )}>
        <RequiredLegend />

        <FormSection title="Donor">
          {donor ? (
            <FormField label="Donor" required>
              {/* Selected state is carried by the check, the border and the
                  "Selected donor" name — never by the tint alone. */}
              <View
                accessibilityLabel={`Selected donor: ${donor.fullName}`}
                style={[
                  styles.chosen,
                  { backgroundColor: theme.brandSubtle, borderColor: theme.brand },
                ]}>
                <View style={styles.avatarWrap}>
                  <Avatar name={donor.fullName} color={donor.avatarColor} size={44} />
                  <View
                    style={[
                      styles.check,
                      { backgroundColor: theme.brand, borderColor: theme.background },
                    ]}>
                    <Ionicons name="checkmark" size={11} color={theme.onBrand} />
                  </View>
                </View>
                <View style={styles.personText}>
                  <ThemedText type="headline" numberOfLines={1}>
                    {donor.fullName}
                  </ThemedText>
                  <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
                    {donorContact(donor)}
                  </ThemedText>
                </View>
                {donor.bloodType ? <BloodTypeGlyph type={donor.bloodType} size="sm" /> : null}
                <Button
                  label="Change"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  accessibilityLabel={`Choose someone other than ${donor.fullName}`}
                  onPress={() => setDonor(null)}
                />
              </View>
            </FormField>
          ) : (
            <View style={styles.search}>
              <Input
                label="Donor"
                required
                icon="search-outline"
                placeholder="Search by name, email, or phone"
                accessibilityLabel="Search for the donor to book"
                value={search}
                onChangeText={(v) => {
                  setSearch(v);
                  clearError('donor');
                }}
                autoCorrect={false}
                autoCapitalize="none"
                editable={!busy}
                error={errors.donor}
                hint={
                  searching
                    ? undefined
                    : `Type at least ${MIN_SEARCH} characters to find an account.`
                }
              />

              {searching ? (
                <View
                  style={[
                    styles.results,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  {results.isPending ? (
                    <ResultsNote>
                      <ActivityIndicator size="small" color={theme.textTertiary} />
                      <ThemedText type="footnote" color="textSecondary">
                        Searching accounts…
                      </ThemedText>
                    </ResultsNote>
                  ) : results.isError ? (
                    <ResultsNote>
                      <Ionicons name="cloud-offline-outline" size={18} color={theme.danger} />
                      <ThemedText type="footnote" color="danger" style={styles.noteText}>
                        Could not search accounts. Check your connection and try again.
                      </ThemedText>
                    </ResultsNote>
                  ) : matches.length === 0 ? (
                    <ResultsNote>
                      <Ionicons name="person-outline" size={18} color={theme.textTertiary} />
                      <ThemedText type="footnote" color="textSecondary" style={styles.noteText}>
                        No account matches “{term}”. Check the spelling, or search by email or phone
                        instead.
                      </ThemedText>
                    </ResultsNote>
                  ) : (
                    <>
                      <ThemedText
                        type="caption"
                        color="textTertiary"
                        style={[styles.resultsHead, { borderBottomColor: theme.border }]}>
                        {matches.length === DONOR_RESULTS
                          ? `Top ${DONOR_RESULTS} matches — keep typing to narrow`
                          : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}
                      </ThemedText>
                      <View accessibilityRole="list">
                        {matches.map((row, i) => (
                          <Pressable
                            key={row.id}
                            onPress={() => {
                              setDonor(row);
                              setSearch('');
                              clearError('donor');
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Book for ${row.fullName}, ${row.email}${row.bloodType ? `, blood type ${row.bloodType}` : ''}`}
                            style={({ hovered, pressed }) => [
                              styles.result,
                              i > 0
                                ? {
                                    borderTopColor: theme.border,
                                    borderTopWidth: StyleSheet.hairlineWidth,
                                  }
                                : null,
                              hovered ? { backgroundColor: theme.surfaceSunken } : null,
                              pressed ? { backgroundColor: theme.brandSubtle } : null,
                            ]}>
                            <Avatar name={row.fullName} color={row.avatarColor} size={36} />
                            <View style={styles.personText}>
                              <ThemedText type="subhead" numberOfLines={1} style={styles.name}>
                                {row.fullName}
                              </ThemedText>
                              <ThemedText type="footnote" color="textTertiary" numberOfLines={1}>
                                {donorContact(row)}
                              </ThemedText>
                            </View>
                            {row.bloodType ? (
                              <BloodTypeGlyph type={row.bloodType} size="sm" />
                            ) : (
                              <ThemedText type="caption" color="textTertiary">
                                No profile
                              </ThemedText>
                            )}
                            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </FormSection>

        {/* Descending z-index so an open menu or calendar covers the bands below. */}
        <FormSection title="Schedule" style={formStyles.z3}>
          <View style={formStyles.z3}>
            <Select
              label="Center"
              variant="field"
              icon="business-outline"
              options={centerOptions}
              value={centerId}
              onChange={(v) => {
                setCenterId(v);
                clearError('center');
              }}
              tintActive={false}
              required
              error={errors.center}
            />
          </View>
          <FormRow style={formStyles.z2}>
            <FormCell>
              <DateFilter
                variant="field"
                label="Day"
                value={day}
                onChange={(v) => {
                  setDay(v);
                  clearError('day');
                }}
                placeholder="Pick a day"
                clearable={false}
                required
                error={errors.day}
              />
            </FormCell>
            <FormCell>
              <Select
                label="Time"
                variant="field"
                icon="time-outline"
                options={slotOptions(day)}
                value={slot}
                onChange={(v) => {
                  setSlot(v);
                  clearError('day');
                }}
                tintActive={false}
                required
              />
            </FormCell>
          </FormRow>
        </FormSection>

        <FormSection title="Donation">
          <FormField label="Donation type" required>
            <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={setType} />
          </FormField>
        </FormSection>

        <FormNotice tone="info">
          A donor holds one upcoming appointment at a time, and cannot be booked inside their
          recovery window. If either applies, the booking is refused and nothing changes.
        </FormNotice>
      </Drawer>
    </>
  );
}

/** A one-line status inside the results panel: searching, nothing found, or failed. */
function ResultsNote({ children }: { children: React.ReactNode }) {
  return <View style={styles.note}>{children}</View>;
}

const styles = StyleSheet.create({
  search: { gap: Spacing.sm },

  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  avatarWrap: { position: 'relative' },
  check: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontWeight: '600' },

  // Attached under the search field like a menu, but in the flow of the form
  // rather than floating: inside a scrolling drawer, an overlay would be cut
  // off at the panel's edge.
  results: {
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(22, 25, 45, 0.08)',
  },
  resultsHead: {
    letterSpacing: 0.6,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 60,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.base,
  },
  noteText: { flex: 1 },
});
