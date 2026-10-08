/**
 * POST /api/admin/users/[id]/status — suspend, reactivate, or delete an account.
 *
 * One route rather than three, for the same reason moderation is one route: the
 * audit write is then structurally impossible to omit.
 *
 * The Better Auth `admin()` plugin already implements all three, and its own
 * endpoints are mounted at `/api/auth/admin/*` — but those bypass `handle()`
 * and `requireAdmin`, and nothing there writes an audit row. So the client never
 * calls them; this audited wrapper calls them server-side through
 * `callAuthAdmin`, which forwards the caller's headers (the plugin re-checks the
 * admin session rather than trusting us) and maps its errors into this
 * project's envelope.
 *
 * Suspension takes effect immediately rather than at token expiry: the plugin's
 * `banUser` deletes the account's sessions as part of the ban, and the ban is
 * enforced in the sign-in path, so a suspended donor is signed out and cannot
 * sign back in.
 *
 * Deletion is a real cascading delete (every FK to `user` cascades) and cannot
 * be undone, so its audit row is written **first**, with an identifying
 * snapshot — afterwards there is nothing left to point at.
 */
import { eq } from 'drizzle-orm';

import { profiles, pushTokens, user as authUser } from '@/db/schema';
import { auth } from '@/lib/server/auth';
import { callAuthAdmin } from '@/lib/server/auth-admin';
import { logAdminAction } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import { badRequest, conflict, handle, json, notFound, readJson } from '@/lib/server/http';
import { toAdminDonor } from '@/lib/server/serialize';
import { requireAdmin } from '@/lib/server/session';
import type { AdminDonor, DonorStatusAction, DonorStatusBody } from '@/types/api';

const ACTIONS: DonorStatusAction[] = ['suspend', 'reactivate', 'delete'];

const MAX_REASON = 500;

export const POST = handle(async (request, { id }) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<DonorStatusBody>(request);

  if (!body.action || !ACTIONS.includes(body.action)) {
    throw badRequest(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  const action = body.action;

  const reason = body.reason?.trim() || undefined;
  // Suspension locks a donor out and deletion is irreversible. The reason is
  // the only record of why, so neither is allowed without one. Reactivation is
  // restorative, so its reason stays optional.
  if ((action === 'suspend' || action === 'delete') && !reason) {
    throw badRequest(
      action === 'suspend'
        ? 'A reason is required to suspend an account'
        : 'A reason is required to delete an account',
    );
  }
  if (reason && reason.length > MAX_REASON) {
    throw badRequest(`reason must be ${MAX_REASON} characters or fewer`);
  }

  const [target] = await db
    .select({ u: authUser, p: profiles })
    .from(authUser)
    .leftJoin(profiles, eq(profiles.userId, authUser.id))
    .where(eq(authUser.id, id))
    .limit(1);
  if (!target) throw notFound('Account not found');

  // The plugin refuses both of these too, but its message is about itself; this
  // one is about what the operator was trying to do.
  if (target.u.id === user.id) {
    throw conflict(
      action === 'delete'
        ? 'You cannot delete your own account from the console'
        : 'You cannot change your own account status from the console',
    );
  }

  const banned = target.u.banned === true;
  if (action === 'suspend' && banned) throw conflict('This account is already suspended');
  if (action === 'reactivate' && !banned) throw conflict('This account is not suspended');

  /** Identifying fields, so a deleted account's audit row still means something. */
  const snapshot = {
    email: target.u.email,
    name: target.u.name,
    role: target.u.role ?? null,
    city: target.p?.city ?? null,
    bloodType: target.p?.bloodType ?? null,
    hasProfile: target.p != null,
  };

  if (action === 'delete') {
    // Audit first: the cascade removes the row this record describes, and a
    // deletion that failed to be recorded is the one outcome we cannot accept.
    await logAdminAction({
      actorId: user.id,
      action: 'user.delete',
      targetType: 'user',
      targetId: id,
      reason,
      metadata: snapshot,
    });

    await callAuthAdmin(
      () => auth.api.removeUser({ body: { userId: id }, headers: request.headers }),
      'Could not delete this account',
    );

    // 204: the account is gone, so there is no resource left to return.
    return new Response(null, { status: 204 });
  }

  if (action === 'suspend') {
    await callAuthAdmin(
      () =>
        auth.api.banUser({
          body: { userId: id, banReason: reason },
          headers: request.headers,
        }),
      'Could not suspend this account',
    );
  } else {
    await callAuthAdmin(
      () => auth.api.unbanUser({ body: { userId: id }, headers: request.headers }),
      'Could not reactivate this account',
    );
  }

  // The plugin owns the write, so the audit row cannot ride in its batch. It is
  // still written in this handler before returning, which is the standard the
  // safety boundaries set.
  await logAdminAction({
    actorId: user.id,
    action: `user.${action}`,
    targetType: 'user',
    targetId: id,
    reason,
    metadata: { ...snapshot, from: banned ? 'suspended' : 'active' },
  });

  // Read the account back rather than assuming the plugin's effect: the ban
  // fields are the plugin's to set, and staff act on what is actually stored.
  const [fresh] = await db
    .select({ u: authUser, p: profiles })
    .from(authUser)
    .leftJoin(profiles, eq(profiles.userId, authUser.id))
    .where(eq(authUser.id, id))
    .limit(1);
  if (!fresh) throw notFound('Account not found');

  const devices = await db
    .select({ id: pushTokens.id })
    .from(pushTokens)
    .where(eq(pushTokens.userId, id));

  const result: AdminDonor = toAdminDonor(fresh.u, fresh.p, devices.length);
  return json(result);
});
