/**
 * Typed fetch wrapper for the domain API. On native it forwards the Better Auth
 * cookie explicitly (credentials omitted); on web it relies on same-origin
 * cookies. Non-2xx responses throw an ApiClientError carrying the server's
 * `{ error: { code, message } }` envelope.
 */
import { Platform } from 'react-native';

import type { ApiErrorBody } from '@/types/api';
import { authClient, getBaseUrl } from './auth-client';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('Content-Type', 'application/json');

  const options: RequestInit = { ...init, headers };
  if (Platform.OS === 'web') {
    options.credentials = 'include';
  } else {
    const cookie = (authClient as { getCookie?: () => string }).getCookie?.();
    if (cookie) headers.set('Cookie', cookie);
    options.credentials = 'omit';
  }

  const res = await fetch(getBaseUrl() + path, options);

  if (!res.ok) {
    let code = 'error';
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.error) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiClientError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  // Centers, articles, and announcements need DELETE. `request()` already
  // returns undefined on 204, so nothing else here changes.
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
