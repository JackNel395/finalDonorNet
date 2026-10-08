/**
 * POST /api/admin/broadcast — send a push notification to a defined segment.
 *
 * The highest-reach capability in the console: it writes to donors' lock
 * screens, so every safety boundary applies at once.
 *
 *   - The segment comes from structured filters, never an arbitrary recipient
 *     list.
 *   - An unfiltered segment, which would reach every donor, is refused unless
 *     `confirmAll` is set. A forgotten filter must not become a mass alert.
 *   - The audit row is written **before** sending, carrying the segment, the
 *     resolved recipient count, and the exact copy. A send that cannot be
 *     recorded does not happen, and a push cannot be un-sent afterwards.
 *   - Sending reuses `sendPushBatches`, so batching and `DeviceNotRegistered`
 *     pruning are identical to the emergency fan-out.
 */
import { logAdminAction } from '@/lib/server/audit';
import { validateBroadcastCopy, validateSegment } from '@/lib/server/broadcast';
import { badRequest, conflict, handle, json, readJson } from '@/lib/server/http';
import { broadcastMessages, resolveSegment, sendPushBatches } from '@/lib/server/push';
import { requireAdmin } from '@/lib/server/session';
import type { BroadcastBody, BroadcastResponse } from '@/types/api';

export const POST = handle(async (request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<BroadcastBody>(request);

  const { segment, isEveryone } = validateSegment(body.segment);
  const { title, text } = validateBroadcastCopy(body);

  // An empty segment is legitimate but has to be deliberate.
  if (isEveryone && !body.confirmAll) {
    throw badRequest(
      'This segment has no filters, so it would reach every donor with a registered device. ' +
        'Set confirmAll to send to everyone on purpose, or add a filter.',
    );
  }

  const resolved = await resolveSegment(segment);
  if (resolved.tokens.length === 0) {
    throw conflict(
      'No donors with a registered device match this segment, so there is nothing to send.',
    );
  }

  // Audited before the send, with the copy verbatim: a push cannot be recalled,
  // so the record of what went out has to exist first.
  await logAdminAction({
    actorId: user.id,
    action: 'broadcast.send',
    targetType: 'broadcast',
    // A broadcast has no row of its own; the actor and timestamp identify it.
    targetId: `segment:${JSON.stringify(segment)}`,
    metadata: {
      segment,
      isEveryone,
      recipientCount: resolved.recipientCount,
      deviceCount: resolved.deviceCount,
      title,
      body: text,
    },
  });

  await sendPushBatches(broadcastMessages(resolved.tokens, title, text));

  const response: BroadcastResponse = {
    recipientCount: resolved.recipientCount,
    deviceCount: resolved.deviceCount,
  };
  return json(response);
});
