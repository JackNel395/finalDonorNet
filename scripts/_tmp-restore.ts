import 'dotenv/config';
import { announcements, donationCenters, educationArticles } from '../src/db/schema';
import { db } from '../src/lib/server/db';

async function main() {
  await db.insert(donationCenters).values({
    id: 'ctr-5',
    name: "Mactan Doctors' Hospital",
    kind: 'hospital',
    address: 'Basak–Marigondon Rd, Brgy. Basak',
    city: 'Lapu-Lapu City',
    distanceKm: 8.4,
    latitude: 10.2901,
    longitude: 123.967,
    openNow: true,
    hours: '24 hours',
    rating: 4.5,
    needsUrgent: ['A+'],
  }).onConflictDoNothing();

  await db.insert(announcements).values({
    id: 'ann_aa50a233-eefe-40ef-a2ad-b0308f89a55d',
    title: 'Critical O− shortage citywide',
    body: 'Reserves are below a two-day supply. If you are eligible, your donation this week has outsized impact.',
    tag: 'Urgent',
    date: new Date('2026-07-23T04:25:49.401Z'),
    tone: 'brand',
  }).onConflictDoNothing();

  await db.insert(educationArticles).values({
    id: 'art_8af8668d-5d14-4241-bf05-47704439d97a',
    title: 'Are you eligible to donate?',
    summary: 'A quick check of the most common eligibility criteria.',
    minutes: 3,
    category: 'eligibility',
    icon: 'checkmark-circle',
    body: [
      'Under Philippine Red Cross criteria you can donate whole blood if you are 16 to 65 years old and weigh at least 50 kg. Donors aged 16 and 17 need written parental consent.',
      'You should feel well on the day of your donation and be free of cold or flu symptoms.',
      'There is a waiting period of 3 months between whole-blood donations so your body can replenish red cells. (Guidance you may read from US sources says 8 weeks — the Philippine interval is longer.)',
      'Certain medications, recent travel, or tattoos may require a short deferral. When in doubt, the donation center will screen you.',
    ],
  }).onConflictDoNothing();

  console.log('centers', (await db.select().from(donationCenters)).length);
  console.log('announcements', (await db.select().from(announcements)).length);
  console.log('articles', (await db.select().from(educationArticles)).length);
}
main().then(() => process.exit(0)).catch((e: unknown) => { console.error('ERR', e); process.exit(1); });
