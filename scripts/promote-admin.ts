/**
 * Grant or revoke the `admin` role for an existing account, by email.
 *
 * This is the **only** way to mint the first admin: the operations console
 * cannot grant a role nobody holds yet, because every route behind it is
 * guarded by `requireAdmin`. Once one admin exists, later staff can be promoted
 * from here too — there is no in-product role editor in v1.
 *
 * The account must already exist. Sign up through the app (or `npm run db:seed`
 * for a demo account) first, so the password hash is written by Better Auth
 * exactly as `scripts/seed.ts` does — this script never creates users.
 *
 * Idempotent: promoting an existing admin, or demoting a plain user, is a no-op.
 *
 * Run: npm run admin:promote -- <email> [--revoke]
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { user } from '../src/db/schema';
import { db } from '../src/lib/server/db';
import { hasAdminRole } from '../src/lib/server/session';

async function main() {
  const args: string[] = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();

  if (!email) {
    throw new Error('Usage: npm run admin:promote -- <email> [--revoke]');
  }

  const [found] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email));

  if (!found) {
    throw new Error(
      `No account with email ${email}. Sign up through the app first — this script only changes the role of an existing account.`,
    );
  }

  const isAdmin = hasAdminRole(found.role);

  if (revoke) {
    if (!isAdmin) {
      console.log(`${found.email} is not an admin. Nothing to do.`);
      return;
    }
    await db.update(user).set({ role: 'user', updatedAt: new Date() }).where(eq(user.id, found.id));
    console.log(`Revoked admin from ${found.email} (${found.name}). Role is now "user".`);
    return;
  }

  if (isAdmin) {
    console.log(`${found.email} is already an admin (role "${found.role}"). Nothing to do.`);
    return;
  }

  await db.update(user).set({ role: 'admin', updatedAt: new Date() }).where(eq(user.id, found.id));
  console.log(`Promoted ${found.email} (${found.name}) to admin.`);
  // The role is resolved from `user` on every getSession, so an already
  // signed-in session gains access without re-authenticating.
  console.log('Visit /admin on web — an existing session picks this up immediately.');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
