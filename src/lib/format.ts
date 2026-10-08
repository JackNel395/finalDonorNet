/** Lightweight formatting helpers (no external deps). */

export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = then - now.getTime();
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  const fmt = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  let text: string;
  if (abs < min) text = 'just now';
  else if (abs < hour) text = fmt(Math.round(abs / min), 'min');
  else if (abs < day) text = fmt(Math.round(abs / hour), 'hr');
  else text = fmt(Math.round(abs / day), 'day');
  if (text === 'just now') return text;
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * `shortDate` plus the year, for a date far enough in the past that the year is
 * load-bearing — a last donation, where "Mar 22" alone is the difference
 * between eligible now and years overdue.
 */
export function dateWithYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Absolute date and padded time — "Oct 2, 2026 09:15 AM". For a moderation
 * record, where "3 days ago" is easier to read but impossible to quote back on
 * a phone call or match against a hospital's own log.
 */
export function dateTime(iso: string): string {
  return `${dateWithYear(iso)} ${clockTime(iso)}`;
}

export function monthAbbrev(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' });
}

export function dayOfMonth(iso: string): number {
  return new Date(iso).getDate();
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * `timeOfDay` with a padded hour — "09:00 AM", not "9:00 AM". For a column of
 * times in a table, where an unpadded hour shifts every digit after it and the
 * minutes stop lining up down the page.
 */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

export function distanceLabel(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
