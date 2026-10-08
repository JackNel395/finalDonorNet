/**
 * Session guards for API routes. `requireSession` resolves the Better Auth
 * session from the request headers (cookie on web, forwarded Cookie header on
 * native) and throws a 401 envelope when absent; `requireAdmin` additionally
 * demands the staff role. Server-only.
 */
import { auth } from './auth';
import { forbidden, unauthorized } from './http';

/** Roles that may use the operations console. Mirrors `adminRoles` in auth.ts. */
export const ADMIN_ROLES = ['admin'] as const;

export async function requireSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw unauthorized();
  return session;
}

/** True when a Better Auth `role` value grants console access. */
export function hasAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  // Better Auth stores multiple roles as a comma-joined string, so membership
  // is tested rather than compared.
  return role
    .split(',')
    .map((r) => r.trim())
    .some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
}

/**
 * The security boundary for every /api/admin route. The client-side gate in
 * src/app/(admin) exists only so staff are not shown dead controls — it is
 * cosmetic, and nothing relies on it. Returns the session so routes keep the
 * `const { user } = await requireAdmin(request)` shape.
 */
export async function requireAdmin(request: Request) {
  const session = await requireSession(request);
  const { role } = session.user as { role?: string | null };
  if (!hasAdminRole(role)) throw forbidden('Admin access required');
  return session;
}
