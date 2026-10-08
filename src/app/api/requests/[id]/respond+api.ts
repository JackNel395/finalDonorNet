/**
 * POST /api/requests/[id]/respond — the caller offers to donate.
 * 400 on own request, 409 if already responded or the request is closed.
 */
import { and, eq } from 'drizzle-orm';

import { emergencyRequests, responders } from '@/db/schema';
import { db } from '@/lib/server/db';
import { expireOverdueRequests } from '@/lib/server/request-expiry';
import { badRequest, conflict, handle, json, notFound } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';

export const POST = handle(async (request, { id }) => {
  const { user } = await requireSession(request);

  // A feed loaded before the deadline can still offer the button after it;
  // expiring first turns that press into the same 409 as any closed request.
  await expireOverdueRequests();

  const [req] = await db.select().from(emergencyRequests).where(eq(emergencyRequests.id, id));
  if (!req) throw notFound('Request not found');
  if (req.ownerId === user.id) throw badRequest('You cannot respond to your own request');
  if (req.status === 'fulfilled' || req.status === 'expired') {
    throw conflict('This request is no longer accepting donors');
  }

  const existing = await db
    .select({ id: responders.id })
    .from(responders)
    .where(and(eq(responders.requestId, id), eq(responders.userId, user.id)));
  if (existing.length > 0) throw conflict('You have already responded to this request');

  await db.insert(responders).values({ requestId: id, userId: user.id });
  return json({ ok: true, myResponse: { status: 'offered' as const } }, 201);
});
