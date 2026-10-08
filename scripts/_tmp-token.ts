import 'dotenv/config';
import { pushTokens } from '../src/db/schema';
import { db } from '../src/lib/server/db';
async function main() {
  const r = await db.insert(pushTokens).values({
    userId: 'qZR8MzXYhvstAe8ed9iI4l1hGFOCmhye',
    token: 'ExponentPushToken[phase5verifyXXXXXXXX]',
    platform: 'android',
  }).returning();
  console.log(JSON.stringify(r));
}
main().then(() => process.exit(0)).catch((e: unknown) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); });
