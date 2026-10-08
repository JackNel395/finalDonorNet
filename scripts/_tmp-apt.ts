import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { appointments } from '../src/db/schema';
import { db } from '../src/lib/server/db';
async function main() {
  const rows = await db.select({ c: appointments.centerId, n: sql<number>`count(*)` }).from(appointments).groupBy(appointments.centerId);
  console.log(rows);
}
main().then(() => process.exit(0)).catch((e: unknown) => { console.error('ERR', e); process.exit(1); });
