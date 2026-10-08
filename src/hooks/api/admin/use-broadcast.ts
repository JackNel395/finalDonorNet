/**
 * Broadcast preview and send.
 *
 * Both are mutations, including the preview: it is a POST because the segment
 * is a structured object, and it must go through the same parsing the send uses
 * so the count staff confirm is the count that gets written to.
 *
 * Neither is cached. A recipient count is only true at the moment it is
 * resolved — a donor can register a device between a preview and a send — so a
 * stale count must never be shown as current.
 *
 * Deliberately *not* re-exported from the `src/hooks/api` barrel.
 */
import { useMutation } from '@tanstack/react-query';

import { api, type ApiClientError } from '@/lib/api';
import type {
  BroadcastBody,
  BroadcastPreviewResponse,
  BroadcastResponse,
  BroadcastSegmentBody,
} from '@/types/api';

export function useBroadcastPreview() {
  return useMutation<BroadcastPreviewResponse, ApiClientError, BroadcastSegmentBody>({
    mutationFn: (segment) =>
      api.post<BroadcastPreviewResponse>('/api/admin/broadcast/preview', { segment }),
  });
}

/**
 * Sending is not invalidating anything: a push leaves no row the console reads
 * back. The audit trail is the record, and it is written server-side before the
 * send.
 */
export function useSendBroadcast() {
  return useMutation<BroadcastResponse, ApiClientError, BroadcastBody>({
    mutationFn: (body) => api.post<BroadcastResponse>('/api/admin/broadcast', body),
  });
}
