/**
 * Set the email/password credential for an existing account, by email.
 *
 * This exists because there is no recoverable password anywhere: Better Auth
 * stores only a hash, and `emailAndPassword` is enabled in
 * `src/lib/server/auth.ts` **without** a `sendResetPassword` callback, so the
 * built-in forgot-password flow has no delivery channel. For a development
 * database this script is the whole reset path.
 *
 * Hashing goes through `auth.$context`, so the hash is written by exactly the
 * same code the sign-up path uses — never a hand-rolled hash, which would
 * produce a row that cannot be verified at sign-in.
 *
 * The account must already exist; this script never creates users. If the
 * account has no `credential` account row (it was created by a social provider,
 * say), one is inserted — `updatePassword` alone matches on
 * `providerId = 'credential'` and would silently write nothing.
 *
 * Existing sessions are left alone; this changes the credential, not the session.
 *
 * Run: npm run auth:set-password -- <email> <new-password>
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { user } from '../src/db/schema';
import { auth } from '../src/lib/server/auth';
import { db } from '../src/lib/server/db';

const MIN_LENGTH = 8;

async function main() {
  const args: string[] = process.argv.slice(2).filter((a: string) => !a.startsWith('--'));
  const email = args[0]?.trim().toLowerCase();
  const password = args[1];

  if (!email || !password) {
    throw new Error('Usage: npm run auth:set-password -- <email> <new-password>');
  }
  if (password.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters.`);
  }

  const [found] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email));

  if (!found) {
    throw new Error(
      `No account with email ${email}. Sign up through the app first — this script only changes the password of an existing account.`,
    );
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);
  const accounts = await ctx.internalAdapter.findAccounts(found.id);
  const credential = accounts.find((a) => a.providerId === 'credential');

  if (credential) {
    await ctx.internalAdapter.updatePassword(found.id, hashed);
  } else {
    await ctx.internalAdapter.createAccount({
      userId: found.id,
      providerId: 'credential',
      accountId: found.id,
      password: hashed,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('No credential account existed; created one.');
  }

  console.log(`Password set for ${found.email} (${found.name}, role "${found.role}").`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
