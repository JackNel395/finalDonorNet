/**
 * Better Auth server instance. Reads BETTER_AUTH_SECRET / BETTER_AUTH_URL
 * from the environment. Server-only — consumed by the /api/auth/* catch-all
 * route, requireSession, and the seed script.
 */
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';

import * as schema from '../../db/schema';
import { db } from './db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  // `admin()` adds role/banned/banReason/banExpires to `user` (see
  // src/db/auth-schema.ts) and enforces bans in the sign-in path. One staff
  // role only, so the plugin's default resource/action set is sufficient and a
  // custom access-control statement would be unused indirection.
  // https://www.better-auth.com/docs/plugins/admin
  plugins: [expo(), admin({ defaultRole: 'user', adminRoles: ['admin'] })],
  trustedOrigins: [
    'bdsapp://', // production deep-link scheme
    'exp://**', // Expo Go in development
    'http://localhost:*', // Expo web dev server (any port, incl. preview proxy)
    'http://127.0.0.1:*',
  ],
});
