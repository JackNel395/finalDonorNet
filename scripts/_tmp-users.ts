import 'dotenv/config';
import { user } from '../src/db/schema';
import { db } from '../src/lib/server/db';

async function main() {
  const rows = await db.select({ id: user.id, email: user.email, role: user.role }).from(user);
  console.log(JSON.stringify(rows, null, 1));
}
main().then(() => process.exit(0)).catch((e: unknown) => { console.error('ERR', e); process.exit(1); });
