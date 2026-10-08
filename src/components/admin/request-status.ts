/**
 * Status presentation shared by the moderation list and the request detail.
 * Tone always travels with a written label — status is never carried by color
 * alone — and the labels are the operator's words, not the enum's.
 */
import type { BadgeTone } from '@/components/ui/badge';
import type { RequestStatus } from '@/types/domain';

export const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  open: 'info',
  partial: 'warning',
  fulfilled: 'success',
  expired: 'neutral',
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  open: 'Open',
  partial: 'Partly filled',
  fulfilled: 'Fulfilled',
  expired: 'Closed',
};
