/**
 * Bridge between the Better Auth `admin()` plugin's server API and this
 * project's error envelope.
 *
 * The plugin's own endpoints (`/api/auth/admin/*`) bypass `handle()` and
 * `requireAdmin` entirely, so the console never calls them from the client.
 * Instead the audited admin routes call `auth.api.banUser` / `unbanUser` /
 * `removeUser` server-side through `callAuthAdmin`, which:
 *
 *   - forwards the caller's own headers, so the plugin re-checks the admin
 *     session rather than trusting us, and
 *   - translates its `APIError` into an `ApiError`, so a failure reaches the
 *     client as the same `{ error: { code, message } }` shape every other route
 *     returns instead of a 500 from `handle()`'s catch-all.
 *
 * Server-only.
 */
import { APIError } from 'better-auth/api';

import { ApiError } from './http';

/**
 * Status codes the plugin raises that are genuinely the caller's fault. Anything
 * else is ours, and is left to `handle()` to log and report as a 500 — an
 * unexpected auth failure must not be dressed up as a clean client error.
 */
const PASSTHROUGH = new Set([400, 401, 403, 404, 409, 422]);

/**
 * Run a Better Auth admin API call, re-throwing its failures as `ApiError`.
 *
 * `fallbackMessage` is used only when the plugin gives us a status but no
 * message — staff always get a sentence, never a bare code.
 */
export async function callAuthAdmin<T>(fn: () => Promise<T>, fallbackMessage: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof APIError)) throw err;

    const body = err.body as { code?: string; message?: string } | undefined;
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (!PASSTHROUGH.has(status)) throw err;

    // The plugin's codes are SCREAMING_SNAKE (`YOU_CANNOT_BAN_YOURSELF`); this
    // project's envelope uses lower_snake, so they are normalized rather than
    // leaked in two styles.
    const code = body?.code ? body.code.toLowerCase() : 'bad_request';
    throw new ApiError(status, code, body?.message || err.message || fallbackMessage);
  }
}
