/**
 * Shared plumbing for API route handlers. `handle()` wraps a handler so thrown
 * ApiErrors become a consistent `{ error: { code, message } }` envelope and any
 * unexpected error becomes a 500. Server-only.
 */

import { type Coords, isValidLat, isValidLng } from '@/lib/geo';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string) => new ApiError(400, 'bad_request', message);
export const unauthorized = (message = 'Sign in required') =>
  new ApiError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new ApiError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message);
export const conflict = (message: string) => new ApiError(409, 'conflict', message);

export function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Parse a JSON request body, surfacing a clean 400 on malformed input. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest('Invalid JSON body');
  }
}

/**
 * The viewer's coordinates from `?lat=&lng=`. Missing or malformed params yield
 * null rather than a 400 — distances degrade to stored fallbacks, and a bad
 * param must never break the 20s feed poll.
 */
export function readCoords(request: Request): Coords | null {
  const { searchParams } = new URL(request.url);
  const rawLat = searchParams.get('lat')?.trim();
  const rawLng = searchParams.get('lng')?.trim();
  if (!rawLat || !rawLng) return null;
  const latitude = Number(rawLat);
  const longitude = Number(rawLng);
  if (!isValidLat(latitude) || !isValidLng(longitude)) return null;
  return { latitude, longitude };
}

/**
 * A filter the operator didn't set is absent, not invalid — but a value that
 * isn't a member of its enum is a client bug, and silently ignoring it would
 * show staff a result set that doesn't match the filters on screen.
 */
export function readEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const raw = params.get(key)?.trim();
  if (!raw) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw badRequest(`${key} must be one of: ${allowed.join(', ')}`);
  }
  return raw as T;
}

/** A non-negative integer, clamped to `max` where one is given. */
export function readInt(params: URLSearchParams, key: string, max?: number): number | undefined {
  const raw = params.get(key)?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw badRequest(`${key} must be a non-negative integer`);
  return max != null ? Math.min(n, max) : n;
}

/**
 * A parseable date from a query param. Unlike `readCoords`, a malformed value
 * is a 400 rather than a silent null: a date filter the server ignored would
 * show staff a result set that contradicts the range on screen.
 */
export function readDate(params: URLSearchParams, key: string): Date | undefined {
  const raw = params.get(key)?.trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw badRequest(`${key} must be a valid ISO date`);
  return d;
}

type Ctx = Record<string, string>;
type Handler = (request: Request, ctx: Ctx) => Promise<Response> | Response;

/** Wrap a handler so ApiErrors serialize to the standard error envelope. */
export function handle(fn: Handler): Handler {
  return async (request, ctx) => {
    try {
      return await fn(request, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ error: { code: err.code, message: err.message } }, err.status);
      }
      console.error('[api] unhandled error', err);
      return json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
    }
  };
}
