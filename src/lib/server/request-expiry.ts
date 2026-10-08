/**
 * Closing requests whose "needed by" time has passed.
 *
 * Until now nothing ever set `status = 'expired'`: a request posted in July
 * with a July deadline was still "urgent" in October, sat at the top of the
 * donor feed, and offered a Respond button that led nowhere useful. The status
 * enum always had `expired`; this is the thing that finally writes it.
 *
 * It runs lazily, at the top of the routes that read requests, rather than on
 * a schedule. There is no job runner in this deployment, and a stale row only
 * matters at the moment someone reads it — so expiring just before every read
 * gives the same answer a cron would, with nothing extra to operate. It is one
 * indexed-enough UPDATE that touches only rows still open past their deadline,
 * which after the first run is almost always none.
 *
 * Only `open` and `partial` move. A `fulfilled` request keeps its status even
 * after the deadline: it was met, and calling it expired would rewrite what
 * happened. Rows are never deleted — responders, donor history and the console
 * counts all still point at them.
 */
import { and, inArray, lt } from 'drizzle-orm';

import { emergencyRequests } from '@/db/schema';
import { db } from '@/lib/server/db';

export async function expireOverdueRequests(now = new Date()): Promise<void> {
  await db
    .update(emergencyRequests)
    .set({ status: 'expired' })
    .where(
      and(
        inArray(emergencyRequests.status, ['open', 'partial']),
        lt(emergencyRequests.neededBy, now),
      ),
    );
}
