import 'dotenv/config';
import { desc, eq, sql } from 'drizzle-orm';
import { adminAuditLog, appointments, donationCenters, donations, announcements, educationArticles } from '../src/db/schema';
import { db } from '../src/lib/server/db';

async function main() {
  const rows = await db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(15);
  console.log('=== last audit rows ===');
  for (const r of rows) console.log(r.createdAt?.toISOString(), r.action, r.targetType, r.targetId, JSON.stringify(r.metadata).slice(0, 120));
  console.log('=== counts ===');
  console.log('centers', (await db.select({ n: sql<number>`count(*)` }).from(donationCenters))[0].n);
  console.log('announcements', (await db.select({ n: sql<number>`count(*)` }).from(announcements))[0].n);
  console.log('articles', (await db.select({ n: sql<number>`count(*)` }).from(educationArticles))[0].n);
  console.log('appointments', (await db.select({ n: sql<number>`count(*)` }).from(appointments))[0].n);
  console.log('donations', (await db.select({ n: sql<number>`count(*)` }).from(donations))[0].n);
  console.log('=== donations columns referencing center? ===');
  const d = await db.select().from(donations).limit(1);
  console.log(Object.keys(d[0] ?? {}).join(', '));
}
main().then(() => process.exit(0)).catch((e: unknown) => { console.error('ERR', e); process.exit(1); });
