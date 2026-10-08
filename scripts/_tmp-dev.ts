import 'dotenv/config';
import { pushTokens } from '../src/db/schema';
import { db } from '../src/lib/server/db';
async function main() {
  const rows = await db.select().from(pushTokens);
  console.log('push tokens:', rows.length);
  for (const r of rows) console.log(r.userId, String(r.token).slice(0, 28) + '...');
}
main().then(() => process.exit(0)).catch((e: unknown) => { console.error('ERR', e); process.exit(1); });
