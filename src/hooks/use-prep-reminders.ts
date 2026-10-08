/**
 * Donation-preparation reminder state, held as query state under
 * `qk.prepReminders`.
 *
 * Mirrors `use-push`: `usePrepRemindersPref` only *reads* the stored preference
 * and never schedules, `useSetPrepRemindersPref` is the only writer, and
 * `useDonationPrepReminders` is the single reconciler that keeps the OS
 * scheduler in step with app state. Keeping those three apart is what stops two
 * callers from fighting over the same notification ids.
 *
 * The preference is device state, not account state: a local notification
 * schedule only ever exists on this install, so it lives in AsyncStorage and
 * needs no table and no migration.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAppointments } from '@/hooks/api';
import { qk } from '@/hooks/api/keys';
import { usePushState } from '@/hooks/use-push';
import { upcomingAppointment } from '@/lib/booking';
import {
  cancelAllPrepReminders,
  cancelPrepReminders,
  schedulePrepReminders,
} from '@/lib/notifications';
import { getItem, removeItem, setItem, StorageKeys } from '@/lib/storage';

/**
 * The stored preference, defaulting to on. Reminders are purely local and one
 * tap to turn off, so opt-out beats opt-in here. Never prompts, never schedules.
 */
export function usePrepRemindersPref() {
  return useQuery({
    queryKey: qk.prepReminders,
    queryFn: async () => (await getItem<boolean>(StorageKeys.prepReminders)) ?? true,
    staleTime: Infinity,
    retry: false as const,
  });
}

/**
 * Write the preference. Turning it off cancels every pending prep reminder
 * immediately and drops the stored signature, rather than waiting for the
 * reconcile effect — the toggle then stays honest no matter what is mounted.
 */
export function useSetPrepRemindersPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: boolean): Promise<boolean> => {
      await setItem(StorageKeys.prepReminders, next);
      if (!next) {
        await cancelAllPrepReminders();
        await removeItem(StorageKeys.prepReminderSignature);
      }
      return next;
    },
    onSuccess: (next) => qc.setQueryData<boolean>(qk.prepReminders, next),
  });
}

/** `v1|on|granted|<appointment id>|<appointment ISO>` — changes exactly when the schedule should. */
function signatureFor(
  enabled: boolean,
  permission: string,
  id: string | undefined,
  date: string | undefined,
): string {
  return `v1|${enabled ? 'on' : 'off'}|${permission}|${id ?? '-'}|${date ?? '-'}`;
}

/** The appointment id a stored signature was built from, if it had one. */
function appointmentIdFrom(signature: string | null): string | null {
  if (!signature) return null;
  const id = signature.split('|')[3];
  return id && id !== '-' ? id : null;
}

/**
 * Keep the OS scheduler in sync with the preference, the notification grant, and
 * the donor's upcoming appointment. Mount exactly once, from the authenticated
 * tab layout — never from a screen, or two copies would race the same ids.
 */
export function useDonationPrepReminders(): void {
  const { data: appointments } = useAppointments();
  const { data: enabled } = usePrepRemindersPref();
  const { data: permission } = usePushState();

  // Reuse booking.ts's rule rather than re-deriving "next active appointment".
  const upcoming = useMemo(
    () => (appointments ? upcomingAppointment(appointments) : undefined),
    [appointments],
  );

  const applied = useRef<string | null>(null);
  const desired = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [retry, setRetry] = useState(0);

  // Hydrate the last applied signature once, so a relaunch with unchanged state
  // does zero native work.
  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await getItem<string>(StorageKeys.prepReminderSignature);
      if (!active) return;
      applied.current = stored ?? null;
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // `undefined` means "not loaded yet", and must never be read as "no
  // appointment" — the most important guard in this feature. `useAppointments`
  // is undefined before the first fetch, and treating that as `[]` would look
  // like "nothing upcoming, cancel everything" and wipe a valid schedule on
  // every cold start.
  const signature =
    appointments !== undefined && enabled !== undefined && permission !== undefined
      ? signatureFor(enabled, permission, upcoming?.id, upcoming?.date)
      : null;

  // Declared before the reconcile effect so the target is always current by the
  // time a reconcile finishes and checks whether it was overtaken.
  useEffect(() => {
    desired.current = signature;
  }, [signature]);

  useEffect(() => {
    if (!hydrated || !signature) return;
    if (applied.current === signature) return;
    // Overlapping refetches must not interleave. A signature that changes while
    // this one is in flight is picked up by the re-check below, not dropped.
    if (inFlight.current) return;

    inFlight.current = true;
    void (async () => {
      try {
        // A different appointment than last time: clear its reminders by id,
        // since enumeration alone can't tell us it's stale.
        const previousId = appointmentIdFrom(applied.current);
        if (previousId && previousId !== upcoming?.id) {
          await cancelPrepReminders(previousId);
        }

        if (enabled && permission === 'granted' && upcoming) {
          await schedulePrepReminders({
            appointmentId: upcoming.id,
            appointmentISO: upcoming.date,
          });
        } else {
          await cancelAllPrepReminders();
        }

        applied.current = signature;
        await setItem(StorageKeys.prepReminderSignature, signature);
      } catch {
        // Scheduling is best-effort; leave the signature unapplied so the next
        // reconcile retries rather than letting anything throw into render.
      } finally {
        inFlight.current = false;
        // Only re-run if state moved while we were working. Keying off the
        // signature we just handled — not off `applied` — means a persistent
        // failure waits for the next real change instead of spinning.
        if (desired.current && desired.current !== signature) {
          setRetry((n) => n + 1);
        }
      }
    })();
    // Only the signature decides whether to reconcile; the rest is read through
    // it. `retry` re-runs this after a reconcile that was overtaken mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, hydrated, retry]);
}
