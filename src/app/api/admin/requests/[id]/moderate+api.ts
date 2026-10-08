/**
 * POST /api/admin/requests/[id]/moderate — the one moderation entry point.
 *
 * One route rather than four, because the audit write is then structurally
 * impossible to omit: every branch below pairs its mutation with an
 * `admin_audit_log` insert in the same `db.batch`, so the two commit together
 * (neon-http has no interactive transactions).
 *
 * A take-down expires the request; it never deletes the row. Donors may already
 * be travelling to the hospital on the strength of the push that went out, so
 * their open screen must resolve to a clear closed state rather than a 404, and
 * the row has to survive for a later dispute.
 */
import { count, eq } from 'drizzle-orm';

import { emergencyRequests, responders, user as authUser } from '@/db/schema';
import { logAdminAction } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import { badRequest, conflict, handle, json, notFound, readJson } from '@/lib/server/http';
import { toAdminRequest } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminRequest, ModerateAction, ModerateRequestBody } from '@/types/api';
import type { RequestStatus } from '@/types/domain';

const ACTIONS: ModerateAction[] = ['verify', 'expire', 'fulfill', 'takedown'];

/** Keeps a pasted essay out of the audit row without truncating a real reason. */
const MAX_REASON = 500;

export const POST = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<ModerateRequestBody>(request);

  if (!body.action || !ACTIONS.includes(body.action)) {
    throw badRequest(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  const action = body.action;

  const reason = body.reason?.trim() || undefined;
  // A take-down closes someone else's emergency request. The reason is the only
  // record of why, so it is not optional.
  if (action === 'takedown' && !reason) {
    throw badRequest('A reason is required to take down a request');
  }
  if (reason && reason.length > MAX_REASON) {
    throw badRequest(`reason must be ${MAX_REASON} characters or fewer`);
  }

  const [row] = await db
    .select({ req: emergencyRequests, ownerName: authUser.name, ownerEmail: authUser.email })
    .from(emergencyRequests)
    .innerJoin(authUser, eq(emergencyRequests.ownerId, authUser.id))
    .where(eq(emergencyRequests.id, id))
    .limit(1);
  if (!row) throw notFound('Request not found');

  const { req } = row;
  const from = req.status;

  // What each action does to the status. `verify` is an attestation only —
  // `request_status` has no `verified` member, so it records the check and
  // changes nothing.
  if (action === 'verify' && from === 'expired') {
    throw conflict('This request is already closed, so there is nothing to verify');
  }
  if ((action === 'expire' || action === 'takedown') && from === 'expired') {
    throw conflict('This request is already closed');
  }
  if (action === 'fulfill') {
    if (from === 'fulfilled') throw conflict('This request is already marked fulfilled');
    if (from === 'expired') throw conflict('A closed request cannot be marked fulfilled');
  }

  const metadata = {
    from,
    urgency: req.urgency,
    bloodType: req.bloodType,
    hospital: req.hospital,
    city: req.city,
    unitsNeeded: req.unitsNeeded,
    unitsFulfilled: req.unitsFulfilled,
    ownerId: req.ownerId,
  };

  const audit = (to: RequestStatus | null) =>
    logAdminAction({
      actorId: user.id,
      action: `request.${action}`,
      targetType: 'request',
      targetId: req.id,
      reason,
      metadata: { ...metadata, to },
    });

  let updated = req;
  if (action === 'verify') {
    // Nothing to keep atomic with: there is no mutation but the record itself.
    await audit(null);
  } else {
    const set =
      action === 'fulfill'
        ? { status: 'fulfilled' as const, unitsFulfilled: req.unitsNeeded }
        : { status: 'expired' as const };
    const [[next]] = await db.batch([
      db
        .update(emergencyRequests)
        .set(set)
        .where(eq(emergencyRequests.id, req.id))
        .returning(),
      audit(set.status),
    ]);
    updated = next;
  }

  const [{ c }] = await db
    .select({ c: count() })
    .from(responders)
    .where(eq(responders.requestId, req.id));

  const result: AdminRequest = toAdminRequest(updated, Number(c), {
    name: row.ownerName,
    email: row.ownerEmail,
  });
  return json(result);
});
