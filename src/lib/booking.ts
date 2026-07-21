/**
 * Booking rules for donation appointments, shared by the book screen and
 * POST /api/appointments so the picker and the server agree on what may be
 * booked. Client-safe: types and `blood.ts` only, no server imports.
 *
 * The two sides deliberately enforce different strictness:
 *
 *   - Slot timing (lead time, elapsed slots) is enforced only in the UI. The
 *     server just refuses a date in the past, so client/server clock skew can
 *     never reject a slot the donor legitimately picked.
 *   - The recovery window is compared by calendar day rather than by instant,
 *     because the 90-day interval is a day count and the donor's timezone is
 *     not the server's. The server allows a day of slack for the same reason.
 */

import type { Appointment, Donation } from '@/types/domain';
import { computeEligibility } from './blood';

/** Slots centers offer, 24-hour "HH:MM", ascending. */
export const SLOTS = ['08:30', '09:15', '10:00', '11:30', '13:00', '14:45', '16:00'];

/** Minimum notice before a slot: no booking the 09:15 slot at 09:10. */
export const BOOKING_LEAD_MINUTES = 60;

/** How many days the date picker offers, starting at the first bookable day. */
export const BOOKING_WINDOW_DAYS = 10;

export const DONATION_TYPES: Donation['type'][] = ['whole', 'plasma', 'platelets', 'power_red'];

export const DONATION_TYPE_LABEL: Record<Donation['type'], string> = {
  whole: 'Whole blood',
  plasma: 'Plasma',
  platelets: 'Platelets',
  power_red: 'Power Red',
};

export function isDonationType(value: unknown): value is Donation['type'] {
  return typeof value === 'string' && (DONATION_TYPES as string[]).includes(value);
}

/** Appointment statuses that still occupy the donor's calendar. */
const ACTIVE_STATUSES: Appointment['status'][] = ['confirmed', 'pending'];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The local datetime of `slot` ("HH:MM") on the calendar day of `dayISO`. */
export function slotDateTime(dayISO: string, slot: string): Date {
  const [hours, minutes] = slot.split(':').map(Number);
  const when = new Date(dayISO);
  when.setHours(hours, minutes, 0, 0);
  return when;
}

/**
 * First calendar day the donor may book: today, or the day their recovery
 * window ends. Compared by day so a donor eligible "on Oct 12" can take the
 * 08:30 slot that day even though their last donation was logged at 14:30.
 */
export function firstBookableDay(lastDonationISO?: string, now = new Date()): Date {
  const today = startOfDay(now);
  const eligibleDay = startOfDay(computeEligibility(lastDonationISO, now).nextEligibleDate);
  return eligibleDay.getTime() > today.getTime() ? eligibleDay : today;
}

/** Whether `slot` on `dayISO` can still be booked: not elapsed, past recovery. */
export function isSlotBookable(
  dayISO: string,
  slot: string,
  lastDonationISO?: string,
  now = new Date(),
): boolean {
  const when = slotDateTime(dayISO, slot);
  if (when.getTime() - now.getTime() < BOOKING_LEAD_MINUTES * 60_000) return false;
  return startOfDay(when).getTime() >= firstBookableDay(lastDonationISO, now).getTime();
}

export function dayHasBookableSlot(
  dayISO: string,
  lastDonationISO?: string,
  now = new Date(),
): boolean {
  return SLOTS.some((slot) => isSlotBookable(dayISO, slot, lastDonationISO, now));
}

/**
 * Days to offer in the picker: `count` consecutive days from the first bookable
 * one, skipping it when its slots have all elapsed — at 5pm the last slot
 * (16:00) is gone, so today should not be offered at all. Only the first day
 * can be partly elapsed, so at most one day is ever skipped.
 */
export function bookableDays(
  lastDonationISO?: string,
  now = new Date(),
  count = BOOKING_WINDOW_DAYS,
): string[] {
  const start = firstBookableDay(lastDonationISO, now);
  const offset = dayHasBookableSlot(start.toISOString(), lastDonationISO, now) ? 0 : 1;
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + offset + i);
    return day.toISOString();
  });
}

/**
 * The donor's next still-active appointment, if any. One at a time is the rule:
 * with a 90-day recovery window a second upcoming booking is a mistake rather
 * than a plan, so the book screen and the API both refuse one while this
 * returns a value.
 */
export function upcomingAppointment(
  appointments: Appointment[],
  now = new Date(),
): Appointment | undefined {
  return appointments
    .filter(
      (a) => ACTIVE_STATUSES.includes(a.status) && new Date(a.date).getTime() > now.getTime(),
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
}
