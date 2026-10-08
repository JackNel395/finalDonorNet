/**
 * Push fan-out. Two senders share one transport:
 *
 *   - `notifyMatchingDonors` — the emergency fan-out, fired by POST /api/requests.
 *   - `resolveSegment` + `sendPushBatches` — the admin console's broadcast.
 *
 * Uses the Expo push API directly (no `expo-server-sdk` dependency, no API key
 * needed). Sends in batches of ≤100, and prunes tokens the API reports as
 * `DeviceNotRegistered`.
 *
 * `sendPushBatches` was extracted from `notifyMatchingDonors` rather than
 * forked, so a dead token is pruned identically whichever sender wrote to it
 * and the emergency path keeps exactly the batching it always had. Server-only.
 */
import { and, eq, ilike, inArray, ne, sql, type SQL } from 'drizzle-orm';

import {
  donations,
  emergencyRequests,
  profiles,
  pushTokens,
  user as authUser,
} from '@/db/schema';
import { donorsFor, PH_DONATION_INTERVAL_DAYS } from '@/lib/blood';
import { db } from '@/lib/server/db';
import { type Coords, haversineKm } from '@/lib/geo';
import type { BloodType, Urgency } from '@/types/domain';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;
const NEARBY_KM = 50;

const URGENCY_WORD: Record<Urgency, string> = {
  critical: 'Critical',
  urgent: 'Urgent',
  moderate: 'Moderate',
  routine: 'Routine',
};

/** One push message. Tickets come back positionally aligned with these. */
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: { url: string };
  sound: 'default';
  channelId: 'default';
  priority: 'high';
}

type RequestRow = typeof emergencyRequests.$inferSelect;

/** Split an array into fixed-size chunks. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Notify every donor who can give to `request.bloodType`, excluding the owner.
 * When both the request and a donor have coords, keep only donors within
 * ~50 km; donors without coords are always included (recall beats precision for
 * a blood alert — city-hash distances aren't meaningful to filter on).
 */
export async function notifyMatchingDonors(request: RequestRow): Promise<void> {
  const compatible = donorsFor(request.bloodType);
  if (compatible.length === 0) return;

  const rows = await db
    .select({
      token: pushTokens.token,
      lat: profiles.latitude,
      lng: profiles.longitude,
    })
    .from(pushTokens)
    .innerJoin(profiles, eq(profiles.userId, pushTokens.userId))
    .where(
      and(
        inArray(profiles.bloodType, compatible),
        ne(pushTokens.userId, request.ownerId),
      ),
    );
  if (rows.length === 0) return;

  const origin: Coords | null =
    request.latitude != null && request.longitude != null
      ? { latitude: request.latitude, longitude: request.longitude }
      : null;

  const recipients = rows.filter((r) => {
    if (!origin || r.lat == null || r.lng == null) return true; // no distance → include
    return haversineKm(origin, { latitude: r.lat, longitude: r.lng }) <= NEARBY_KM;
  });
  if (recipients.length === 0) return;

  const title = `🩸 ${request.bloodType} blood needed near you`;
  const body = `${request.hospital}, ${request.city} — ${URGENCY_WORD[request.urgency]}, ${request.unitsNeeded} unit${request.unitsNeeded === 1 ? '' : 's'}`;
  const messages: ExpoMessage[] = recipients.map((r) => ({
    to: r.token,
    title,
    body,
    data: { url: `/request/${request.id}` },
    sound: 'default',
    channelId: 'default',
    priority: 'high',
  }));

  await sendPushBatches(messages);
}

/**
 * Send any number of messages, in batches of ≤100, pruning dead tokens.
 *
 * This is the whole of what `notifyMatchingDonors` used to do inline. Both
 * senders now go through it, so neither can drift from the other on batching or
 * on `DeviceNotRegistered` handling.
 */
export async function sendPushBatches(messages: ExpoMessage[]): Promise<void> {
  for (const batch of chunk(messages, CHUNK)) {
    await sendBatch(batch);
  }
}

/** POST one ≤100 batch and prune tokens the API rejects as unregistered. */
async function sendBatch(batch: ExpoMessage[]): Promise<void> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    console.error('[push] Expo API responded', res.status, await res.text().catch(() => ''));
    return;
  }

  // Tickets come back positionally aligned with the batch we sent.
  const payload = (await res.json().catch(() => null)) as {
    data?: { status: string; details?: { error?: string } }[];
  } | null;
  const tickets = payload?.data;
  if (!tickets) return;

  const dead = batch
    .filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered')
    .map((m) => m.to);
  if (dead.length > 0) {
    await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
  }
}

// --- Admin broadcast -------------------------------------------------------

/**
 * Who a broadcast goes to. Chosen from structured filters, never an arbitrary
 * recipient list — that is a safety boundary, not a UI convenience.
 *
 * `intervalElapsed` is deliberately **not** called `eligibleOnly`.
 * `computeEligibility` measures donation-interval spacing
 * (`PH_DONATION_INTERVAL_DAYS`), not medical fitness, and nothing here may
 * imply the app has made a medical eligibility decision about a donor.
 */
export interface BroadcastSegment {
  /**
   * Donors who **are** this blood type. Note this differs from the emergency
   * fan-out, which uses `donorsFor()` compatibility: a broadcast is addressed
   * to a group of donors, not matched to a patient's need.
   */
  bloodType?: BloodType;
  /** Case-insensitive substring, matching every other admin city filter. */
  city?: string;
  /** Only donors whose donation interval has elapsed. */
  intervalElapsed?: boolean;
}

export interface ResolvedSegment {
  /** Device tokens to send to. */
  tokens: string[];
  /** Distinct donors matched — the number staff must confirm. */
  recipientCount: number;
  /** Devices matched; higher than `recipientCount` when a donor has several. */
  deviceCount: number;
}

/**
 * Resolve a segment to the tokens it would reach, without sending anything.
 *
 * Suspended accounts are excluded: a banned donor cannot sign in, so pushing to
 * their lock screen would be an alert they are unable to act on.
 */
export async function resolveSegment(segment: BroadcastSegment): Promise<ResolvedSegment> {
  // Mirrors `effectiveLastDonation`: the profile's own date, else the newest
  // donation on file. Kept in SQL so the segment never loads every donor.
  const lastDonation = sql<Date | null>`coalesce(${profiles.lastDonationDate}, (select max(${donations.date}) from ${donations} where ${donations.userId} = ${profiles.userId}))`;

  const filters: SQL[] = [
    // A suspended donor is not a valid recipient.
    sql`coalesce(${authUser.banned}, false) = false`,
  ];
  if (segment.bloodType) filters.push(eq(profiles.bloodType, segment.bloodType));
  if (segment.city) filters.push(ilike(profiles.city, `%${segment.city}%`));
  if (segment.intervalElapsed) {
    const cutoff = new Date(Date.now() - PH_DONATION_INTERVAL_DAYS * 86_400_000);
    // Never donated, or the interval has already passed.
    filters.push(sql`(${lastDonation} is null or ${lastDonation} <= ${cutoff})`);
  }

  const rows = await db
    .select({ token: pushTokens.token, userId: pushTokens.userId })
    .from(pushTokens)
    .innerJoin(profiles, eq(profiles.userId, pushTokens.userId))
    .innerJoin(authUser, eq(authUser.id, pushTokens.userId))
    .where(and(...filters));

  return {
    tokens: rows.map((r) => r.token),
    recipientCount: new Set(rows.map((r) => r.userId)).size,
    deviceCount: rows.length,
  };
}

/** Build the messages for a broadcast. Taps open the home feed. */
export function broadcastMessages(tokens: string[], title: string, body: string): ExpoMessage[] {
  return tokens.map((to) => ({
    to,
    title,
    body,
    data: { url: '/(tabs)/home' },
    sound: 'default',
    channelId: 'default',
    priority: 'high',
  }));
}
