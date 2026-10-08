/**
 * GET /api/admin/me — the console's gate. Returns the caller's staff role when
 * `requireAdmin` admits them: 401 signed out, 403 signed in without the role.
 *
 * The client gate in src/app/(admin) reads this so staff are not shown dead
 * controls, but the guard on this and every sibling route is the actual
 * security boundary.
 */
import { handle, json } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/session';
import type { AdminMeResponse } from '@/types/api';

export const GET = handle(async (request) => {
  const { user } = await requireAdmin(request);
  const { role } = user as { role?: string | null };
  return json<AdminMeResponse>({ role: role ?? 'admin' });
});
