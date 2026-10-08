/**
 * Seed the DonorNet database: global content (centers, announcements, articles)
 * plus demo users with donations and open emergency requests so the feed and
 * detail screens feel alive. New real users start with empty personal data.
 *
 * Idempotent: previous demo users (any *@donornet.demo email) are deleted first
 * (cascades to their requests/responders/donations/appointments); global
 * content is re-inserted; centers are upserted so real users' appointments
 * keep valid references.
 *
 * Run: npm run db:seed
 * Demo accounts (password for all): donornet-demo-123
 *   maria@donornet.demo  (A+, eligible to donate)
 *   daniel@donornet.demo (A+, mid donation cooldown)
 *   miguel@donornet.demo (A-, eligible to donate)
 */
import 'dotenv/config';

import { inArray, like } from 'drizzle-orm';

import {
  announcements,
  appointments,
  donationCenters,
  donations,
  educationArticles,
  emergencyRequests,
  profiles,
  responders,
  user,
} from '../src/db/schema';
import { auth } from '../src/lib/server/auth';
import { db } from '../src/lib/server/db';
import { roundCoord } from '../src/lib/geo';

const DEMO_PASSWORD = 'donornet-demo-123';

/**
 * Metro Cebu coordinate frame, used as the fallback location for demo *people*
 * (profiles) who have no device fix.
 *
 * Centers and hospitals below are real Metro Cebu facilities: names, addresses
 * and coordinates were geocoded against OpenStreetMap, so pins land on the
 * actual buildings and distances are true. Everything a real institution does
 * not publish through this app — opening hours, ratings, urgent-need lists,
 * patients, contacts and phone numbers — is demo data, marked where it appears.
 */
const CITY = {
  cebu: { name: 'Cebu City', latitude: 10.3111, longitude: 123.8931 },
  mandaue: { name: 'Mandaue City', latitude: 10.3236, longitude: 123.9223 },
  talisay: { name: 'Talisay City', latitude: 10.2447, longitude: 123.8494 },
  lapulapu: { name: 'Lapu-Lapu City', latitude: 10.3103, longitude: 123.9494 },
} as const;

/**
 * Contact numbers are deliberately non-dialable. The real facilities' hotlines
 * are public, but a seeded emergency is not a real emergency — nobody testing
 * the app should be able to ring an actual hospital about a patient who does
 * not exist. `555` in the subscriber block marks these as placeholders.
 */
const fakePhone = (n: string) => `+63 917 555 ${n}`;

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
const inHours = (h: number) => new Date(now + h * 3_600_000);
const daysAgo = (d: number) => new Date(now - d * 86_400_000);
const inDays = (d: number) => new Date(now + d * 86_400_000);

async function createDemoUser(name: string, email: string): Promise<string> {
  const res = await auth.api.signUpEmail({ body: { name, email, password: DEMO_PASSWORD } });
  return res.user.id;
}

async function main() {
  console.log('Seeding DonorNet database...');

  // 1. Remove previous demo users; FK cascades clean up everything they own.
  const demoUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(like(user.email, '%@donornet.demo'));
  if (demoUsers.length > 0) {
    await db.delete(user).where(
      inArray(
        user.id,
        demoUsers.map((u) => u.id),
      ),
    );
    console.log(`Removed ${demoUsers.length} previous demo users`);
  }

  // 2. Global content. Centers are upserted (appointments reference them);
  //    announcements/articles have no inbound FKs, so replace wholesale.
  // `distanceKm` is the no-GPS fallback: great-circle km from the Cebu City
  // anchor above, so an unlocated viewer still sees a sane nearest-first order.
  // `hours` / `rating` / `needsUrgent` are demo values, not published figures.
  const centers = [
    {
      id: 'ctr-1',
      name: 'Philippine Red Cross – Cebu Chapter',
      kind: 'blood_bank',
      address: 'Osmeña Blvd, Brgy. Santa Cruz',
      city: CITY.cebu.name,
      distanceKm: 0.2,
      latitude: 10.3124,
      longitude: 123.892,
      openNow: true,
      hours: '8:00 AM – 5:00 PM',
      rating: 4.8,
      needsUrgent: ['O-', 'O+'],
    },
    {
      id: 'ctr-2',
      name: 'Vicente Sotto Memorial Medical Center',
      kind: 'hospital',
      address: 'B. Rodriguez St, Brgy. Sambag II',
      city: CITY.cebu.name,
      distanceKm: 0.4,
      // ~0.5 km from ctr-1: two Cebu City centers that must not collide.
      latitude: 10.3078,
      longitude: 123.8916,
      openNow: true,
      hours: '24 hours',
      rating: 4.6,
      needsUrgent: ['O-'],
    },
    {
      id: 'ctr-3',
      // The one invented facility: a bloodletting drive is a temporary event, so
      // it can't be a standing real listing. Anchored to a real civic venue.
      name: 'Talisay City Bloodletting Drive',
      kind: 'campaign',
      address: 'Talisay City Hall, Cebu South Coastal Rd, Brgy. Lawaan II',
      city: CITY.talisay.name,
      distanceKm: 9.5,
      latitude: 10.2534,
      longitude: 123.8293,
      openNow: false,
      hours: 'Sat 9:00 AM – 3:00 PM',
      rating: 4.9,
      needsUrgent: null,
    },
    {
      id: 'ctr-4',
      name: 'University of Cebu Medical Center',
      kind: 'hospital',
      address: 'Ouano Ave, Brgy. Guizo',
      city: CITY.mandaue.name,
      distanceKm: 4.2,
      latitude: 10.3208,
      longitude: 123.9303,
      openNow: true,
      hours: '24 hours',
      rating: 4.7,
      needsUrgent: ['AB-', 'B+'],
    },
    {
      id: 'ctr-5',
      name: "Mactan Doctors' Hospital",
      kind: 'hospital',
      address: 'Basak–Marigondon Rd, Brgy. Basak',
      city: CITY.lapulapu.name,
      distanceKm: 8.4,
      latitude: 10.2901,
      longitude: 123.967,
      openNow: true,
      hours: '24 hours',
      rating: 4.5,
      needsUrgent: ['A+'],
    },
  ] as const;
  for (const center of centers) {
    const { id, ...rest } = center;
    await db
      .insert(donationCenters)
      .values(center as typeof donationCenters.$inferInsert)
      .onConflictDoUpdate({
        target: donationCenters.id,
        set: rest as Partial<typeof donationCenters.$inferInsert>,
      });
  }

  await db.delete(announcements);
  await db.insert(announcements).values([
    {
      title: 'Critical O− shortage citywide',
      body: 'Reserves are below a two-day supply. If you are eligible, your donation this week has outsized impact.',
      tag: 'Urgent',
      date: hoursAgo(2),
      tone: 'brand',
    },
    {
      title: 'Weekend community drive',
      body: 'Talisay City Hall grounds, Saturday 9–3. Walk-ins welcome, merienda provided.',
      tag: 'Event',
      date: hoursAgo(20),
      tone: 'info',
    },
    {
      title: 'New: reschedule from your card',
      body: 'You can now manage appointments directly from your digital donor card.',
      tag: 'Product',
      date: daysAgo(2),
      tone: 'success',
    },
  ]);

  await db.delete(educationArticles);
  await db.insert(educationArticles).values([
    {
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
    },
    {
      title: 'What happens during a donation',
      summary: 'From check-in to cookies — the whole process, step by step.',
      minutes: 4,
      category: 'process',
      icon: 'medkit',
      body: [
        'Registration and a brief health questionnaire take about 10 minutes.',
        'A quick finger-prick checks your hemoglobin level.',
        'The donation itself usually takes 8–10 minutes for whole blood.',
        'You will rest and enjoy a snack for 10–15 minutes afterward. The entire visit is about an hour.',
      ],
    },
    {
      title: 'Eating and hydration tips',
      summary: 'How to feel your best before and after giving.',
      minutes: 2,
      category: 'health',
      icon: 'nutrition',
      body: [
        'Drink an extra 500 ml of water in the hours before you donate.',
        'Eat an iron-rich meal and avoid fatty foods beforehand.',
        'Keep the bandage on for a few hours and avoid heavy lifting for the rest of the day.',
      ],
    },
    {
      title: 'Myths about blood donation',
      summary: 'Separating common fears from the facts.',
      minutes: 3,
      category: 'myths',
      icon: 'sparkles',
      body: [
        'Myth: Donating makes you weak. In reality your body replaces the fluid within 24 hours.',
        'Myth: It is painful. Most donors feel only a brief pinch.',
        'Myth: You cannot donate if you have a tattoo. In most regions you can after a short waiting period.',
      ],
    },
  ]);

  // 3. Demo users — created through Better Auth so password hashes are real.
  const maria = await createDemoUser('Maria Villaflor', 'maria@donornet.demo');
  const daniel = await createDemoUser('Daniel Yap', 'daniel@donornet.demo');
  const miguel = await createDemoUser('Miguel Abellana', 'miguel@donornet.demo');
  console.log('Created demo users:', { maria, daniel, miguel });

  await db.insert(profiles).values([
    {
      userId: maria,
      bloodType: 'A+',
      phone: fakePhone('0161'),
      city: CITY.cebu.name,
      // Stored fuzzed, exactly as the live API writes them.
      latitude: roundCoord(CITY.cebu.latitude),
      longitude: roundCoord(CITY.cebu.longitude),
      avatarColor: '#EC4899',
      weightKg: 64,
      lastDonationDate: daysAgo(120), // past the 90-day cooldown → eligible
    },
    {
      userId: daniel,
      bloodType: 'A+',
      phone: fakePhone('0114'),
      city: CITY.talisay.name,
      latitude: roundCoord(CITY.talisay.latitude),
      longitude: roundCoord(CITY.talisay.longitude),
      avatarColor: '#3B82F6',
      weightKg: 78,
      lastDonationDate: daysAgo(40), // still cooling down
    },
    {
      userId: miguel,
      bloodType: 'A-',
      phone: fakePhone('0187'),
      city: CITY.mandaue.name,
      latitude: roundCoord(CITY.mandaue.latitude),
      longitude: roundCoord(CITY.mandaue.longitude),
      avatarColor: '#10B981',
      weightKg: 71,
      lastDonationDate: daysAgo(200),
    },
  ]);

  // 4. Emergency requests. unitsFulfilled stays consistent with confirmed
  //    responder rows (0 unless the owner marked the request fulfilled).
  await db.insert(emergencyRequests).values([
    {
      id: 'req_seed_kl',
      ownerId: maria,
      patientInitials: 'K.L.',
      bloodType: 'A+',
      unitsNeeded: 2,
      urgency: 'urgent',
      // Formerly Talisay District Hospital; the DOH referral hospital for south Cebu.
      hospital: 'Cebu South Medical Center',
      city: CITY.talisay.name,
      distanceKm: 8.8,
      latitude: 10.2537,
      longitude: 123.8383,
      neededBy: inHours(20),
      postedAt: hoursAgo(2),
      contactName: 'Maria Villaflor',
      contactPhone: fakePhone('0161'),
      note: 'Posted on behalf of a family member ahead of surgery.',
      status: 'open',
    },
    {
      id: 'req_seed_sm',
      ownerId: daniel,
      patientInitials: 'S.M.',
      bloodType: 'O-',
      unitsNeeded: 4,
      urgency: 'critical',
      hospital: 'Vicente Sotto Memorial Medical Center',
      city: CITY.cebu.name,
      distanceKm: 0.4,
      // Same site as ctr-2.
      latitude: 10.3078,
      longitude: 123.8916,
      neededBy: inHours(6),
      postedAt: hoursAgo(1),
      contactName: 'Dr. Alfonso Reyes',
      contactPhone: fakePhone('0142'),
      note: 'Trauma patient in surgery. Universal donor urgently needed.',
      status: 'open',
    },
    {
      id: 'req_seed_jk',
      ownerId: miguel,
      patientInitials: 'J.K.',
      bloodType: 'A+',
      unitsNeeded: 2,
      urgency: 'urgent',
      hospital: 'Cebu South Medical Center',
      city: CITY.talisay.name,
      distanceKm: 8.8,
      // Same site as req_seed_kl — one hospital, one location.
      latitude: 10.2537,
      longitude: 123.8383,
      neededBy: inHours(24),
      postedAt: hoursAgo(3),
      contactName: 'Nurse Grace Booc',
      contactPhone: fakePhone('0198'),
      note: 'Scheduled surgery tomorrow morning.',
      status: 'open',
    },
    {
      id: 'req_seed_mt',
      ownerId: maria,
      patientInitials: 'M.T.',
      bloodType: 'B+',
      unitsNeeded: 3,
      urgency: 'moderate',
      hospital: "Mactan Doctors' Hospital",
      city: CITY.lapulapu.name,
      distanceKm: 8.4,
      // Same site as ctr-5.
      latitude: 10.2901,
      longitude: 123.967,
      neededBy: inDays(2),
      postedAt: hoursAgo(9),
      contactName: 'Dr. Lourdes Seno',
      contactPhone: fakePhone('0173'),
      note: 'Pediatric patient, ongoing treatment.',
      status: 'open',
    },
    {
      id: 'req_seed_rd',
      ownerId: daniel,
      patientInitials: 'R.D.',
      bloodType: 'AB-',
      unitsNeeded: 1,
      urgency: 'urgent',
      hospital: 'University of Cebu Medical Center',
      city: CITY.mandaue.name,
      distanceKm: 4.2,
      // Same site as ctr-4.
      latitude: 10.3208,
      longitude: 123.9303,
      neededBy: inHours(18),
      postedAt: hoursAgo(5),
      contactName: 'Coordinator Rico Pacaña',
      contactPhone: fakePhone('0110'),
      note: 'Rare type needed for platelet support.',
      status: 'open',
    },
    {
      id: 'req_seed_ec',
      ownerId: miguel,
      patientInitials: 'E.C.',
      bloodType: 'O+',
      unitsNeeded: 6,
      unitsFulfilled: 6,
      urgency: 'routine',
      hospital: 'Philippine Red Cross – Cebu Chapter',
      city: CITY.cebu.name,
      distanceKm: 0.2,
      // Same site as ctr-1.
      latitude: 10.3124,
      longitude: 123.892,
      neededBy: inDays(4),
      postedAt: daysAgo(1),
      contactName: 'Intake Desk',
      contactPhone: fakePhone('0100'),
      note: 'Inventory replenishment drive.',
      status: 'fulfilled',
    },
  ]);

  await db.insert(responders).values([
    // Maria's K.L. request: two compatible donors have offered.
    { requestId: 'req_seed_kl', userId: daniel, respondedAt: hoursAgo(1) },
    { requestId: 'req_seed_kl', userId: miguel, respondedAt: hoursAgo(4) },
    // Miguel's J.K. request: Maria has offered.
    { requestId: 'req_seed_jk', userId: maria, respondedAt: hoursAgo(2) },
  ]);

  // 5. Donation history (drives eligibility + impact stats per user).
  await db.insert(donations).values([
    { userId: maria, date: daysAgo(120), centerName: 'Philippine Red Cross – Cebu Chapter', city: CITY.cebu.name, units: 1, type: 'whole' },
    { userId: maria, date: daysAgo(150), centerName: 'Vicente Sotto Memorial Medical Center', city: CITY.cebu.name, units: 1, type: 'power_red' },
    { userId: maria, date: daysAgo(224), centerName: 'Talisay City Bloodletting Drive', city: CITY.talisay.name, units: 1, type: 'whole' },
    { userId: maria, date: daysAgo(300), centerName: 'Philippine Red Cross – Cebu Chapter', city: CITY.cebu.name, units: 1, type: 'plasma' },
    { userId: maria, date: daysAgo(372), centerName: "Mactan Doctors' Hospital", city: CITY.lapulapu.name, units: 1, type: 'whole' },
    { userId: daniel, date: daysAgo(40), centerName: 'Philippine Red Cross – Cebu Chapter', city: CITY.cebu.name, units: 1, type: 'whole' },
    { userId: daniel, date: daysAgo(130), centerName: 'Vicente Sotto Memorial Medical Center', city: CITY.cebu.name, units: 1, type: 'whole' },
    { userId: miguel, date: daysAgo(200), centerName: 'University of Cebu Medical Center', city: CITY.mandaue.name, units: 1, type: 'whole' },
  ]);

  // 6. One upcoming appointment for Maria.
  await db.insert(appointments).values({
    userId: maria,
    centerId: 'ctr-1',
    date: inDays(3),
    status: 'confirmed',
    type: 'whole',
  });

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
