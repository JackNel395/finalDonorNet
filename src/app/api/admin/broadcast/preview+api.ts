/**
 * POST /api/admin/broadcast/preview — how many donors a segment would reach,
 * **without sending anything**.
 *
 * The two-step send is mandatory, not a nicety: this channel writes to donors'
 * lock screens, and staff must see the reach before committing to it. The
 * preview and the send resolve the segment through the same `resolveSegment`,
 * so the number shown is the number that will be written to.
 *
 * Deliberately a POST despite being read-only: the segment is a structured
 * object, and smuggling it through query params would invite a hand-built URL
 * that doesn't match what the send route parses.
 */
import { handle, json, readJson } from '@/lib/server/http';
import { resolveSegment } from '@/lib/server/push';
import { requireAdmin } from '@/lib/server/session';
import { validateSegment } from '@/lib/server/broadcast';
import type { BroadcastPreviewResponse, BroadcastSegmentBody } from '@/types/api';

export const POST = handle(async (request) => {
  await requireAdmin(request);
  const body = await readJson<{ segment?: BroadcastSegmentBody }>(request);
  const { segment, isEveryone } = validateSegment(body.segment);

  const resolved = await resolveSegment(segment);

  const response: BroadcastPreviewResponse = {
    recipientCount: resolved.recipientCount,
    deviceCount: resolved.deviceCount,
    isEveryone,
  };
  return json(response);
});
