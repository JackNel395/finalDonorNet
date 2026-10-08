/**
 * Session guards for API routes. `requireSession` resolves the Better Auth
 * session from the request headers (cookie on web, forwarded Cookie header on
 * native) and throws a 401 envelope when absent; `requireAdmin` additionally
 * demands the staff role. Server-only.
 *
 * This deliberately does NOT import `./auth`. Metro bundles every `+api.ts`
 * route separately, and pulling in `betterAuth()` costs ~2MB per route, which
 * pushed the server past EAS Hosting's 64MiB worker limit. Instead the session
 * cookie is verified here exactly as Better Auth's `getSession` does
 * (better-call `getSignedCookie`: `<token>.<base64 HMAC-SHA256(secret, token)>`)
 * and the session row is read directly. Differences from `auth.api.getSession`:
 *   - no sliding-expiry refresh here; the client's own `/api/auth/get-session`
 *     call (useSession) still refreshes it through Better Auth;
 *   - no cookie cache (it is not enabled in auth.ts);
 *   - expired rows are rejected but left for Better Auth to clean up.
 * Bans need no extra check: the admin plugin revokes a user's sessions on ban.
 */
import { eq } from 'drizzle-orm';

import { session as sessionTable, user as userTable } from '../../db/schema';
import { db } from './db';
import { forbidden, unauthorized } from './http';

/** Roles that may use the operations console. Mirrors `adminRoles` in auth.ts. */
export const ADMIN_ROLES = ['admin'] as const;

/** Better Auth's session cookie, with and without the HTTPS `__Secure-` prefix. */
const SESSION_COOKIES = ['__Secure-better-auth.session_token', 'better-auth.session_token'];

/** Same parsing rules as better-call's `parseCookies`: first occurrence wins. */
function parseCookies(header: string): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (cookies.has(key)) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"')) value = value.slice(1, -1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // Leave undecodable values as-is, like better-call's tryDecode.
    }
    cookies.set(key, value);
  }
  return cookies;
}

let keyPromise: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');
  keyPromise ??= crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return keyPromise;
}

/** Returns the session token if the signed cookie value is authentic, else null. */
async function verifySignedValue(value: string): Promise<string | null> {
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const token = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (signature.length !== 44 || !signature.endsWith('=')) return null;
  try {
    const bin = atob(signature);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ok = await crypto.subtle.verify('HMAC', await getKey(), bytes, new TextEncoder().encode(token));
    return ok ? token : null;
  } catch {
    return null;
  }
}

export async function requireSession(request: Request) {
  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  const raw = SESSION_COOKIES.map((name) => cookies.get(name)).find(Boolean);
  const token = raw ? await verifySignedValue(raw) : null;
  if (!token) throw unauthorized();

  const [row] = await db
    .select({ session: sessionTable, user: userTable })
    .from(sessionTable)
    .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
    .where(eq(sessionTable.token, token))
    .limit(1);
  if (!row || row.session.expiresAt < new Date()) throw unauthorized();
  return row;
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
