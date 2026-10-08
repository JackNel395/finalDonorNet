import 'dotenv/config';
import { appointments } from '../src/db/schema';
import { db } from '../src/lib/server/db';
async function main() {
  const rows = await db.insert(appointments).values([
    { userId: 'qZR8MzXYhvstAe8ed9iI4l1hGFOCmhye', centerId: 'ctr_7b5e05a5-5dce-45a1-b66e-3626c1951862', date: new Date('2026-11-10T02:00:00.000Z'), status: 'confirmed', type: 'whole' },
    { userId: 'qZR8MzXYhvstAe8ed9iI4l1hGFOCmhye', centerId: 'ctr_7b5e05a5-5dce-45a1-b66e-3626c1951862', date: new Date('2026-11-12T02:00:00.000Z'), status: 'confirmed', type: 'whole' },
  ]).returning();
  console.log(rows.map((r) => r.id).join(' '));
}
main().then(() => process.exit(0)).catch((e: unknown) => { console.error('ERR', e); process.exit(1); });
