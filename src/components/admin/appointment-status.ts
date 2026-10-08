/**
 * Status presentation shared by the appointments list and the booking detail.
 * Tone always travels with a written label — status is never carried by color
 * alone — and the labels are the operator's words, not the enum's.
 *
 * `DOT_COLOR` is the schedule marker beside the date in the list. It repeats
 * the badge's tone so the day can be skimmed down the left edge, and it is only
 * ever a repetition: the word itself is printed in its own column.
 */
import type { BadgeTone } from '@/components/ui/badge';
import type { ThemeColor } from '@/constants/theme';
import type { Appointment } from '@/types/domain';

export const STATUS_TONE: Record<Appointment['status'], BadgeTone> = {
  confirmed: 'success',
  pending: 'warning',
  completed: 'brand',
  cancelled: 'neutral',
};

export const STATUS_LABEL: Record<Appointment['status'], string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const DOT_COLOR: Record<Appointment['status'], ThemeColor> = {
  confirmed: 'success',
  pending: 'warning',
  completed: 'brand',
  cancelled: 'borderStrong',
};
