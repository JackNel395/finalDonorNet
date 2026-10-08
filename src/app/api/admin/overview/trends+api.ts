/**
 * GET /api/admin/overview/trends — the movement behind the overview tiles.
 *
 * The overview already gets each tile's *count* from the list route that owns
 * it (`limit=1`, read `total`). This route exists because a count has no
 * direction: "24 donors" does not tell an operator whether signups are rising,
 * and the tiles claim a change. Rather than invent one on the client, every
 * figure here is counted from a real timestamp column.
 *
 * It is a separate route and not a fifth `limit=1` list call because the
 * question is different in kind — the list routes answer "what is true now",
 * and nothing in their filter vocabulary expresses "bucketed over 8 weeks".
 *
 * Bucketing is done in SQL (`date_trunc`) rather than by fetching rows and
 * grouping in JS: the console must not pull every account it has ever created
 * in order to draw a 6-point line.
 *
 * Each window is named in the response type, so a tile can label what actually
 * moved instead of implying a general trend. Behind `requireAdmin` like its
 * siblings.
 */
import { and, count, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import { user as authUser } from '@/db/auth-schema';
import { appointments, emergencyRequests } from '@/db/schema';
import { db } from '@/lib/server/db';
import { handle, json } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/session';
import type { AdminTrend, AdminTrendsResponse } from '@/types/api';

const DAY = 24 * 60 * 60 * 1000;
const WEEK_BUCKETS = 8;
const MONTH_BUCKETS = 6;

/**
 * Buckets are keyed by their UTC date (`YYYY-MM-DD`) rather than by a parsed
 * `Date`. `date_trunc` over a `timestamptz` returns a value the driver hands
 * back without a zone, which `new Date()` would then read as *local* time — so
 * every lookup would miss by the host's offset and every series would come back
 * all zeroes. A string both sides compute the same way cannot drift.
 */
type Bucket = { bucket: string; c: number };

const key = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function weekStarts(now: Date, n: number): string[] {
  // Monday-based, to agree with Postgres `date_trunc('week', ...)`.
  const monday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
  );
  return Array.from({ length: n }, (_, i) => key(monday - (n - 1 - i) * 7 * DAY));
}

function monthStarts(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    key(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1)),
  );
}

/**
 * Fills the gaps a `GROUP BY` leaves behind: a week with no rows produces no
 * row at all, and a sparkline that silently skipped it would draw a slope that
 * never happened.
 */
function toSeries(rows: Bucket[], starts: string[]): number[] {
  const byKey = new Map(rows.map((r) => [r.bucket, Number(r.c)]));
  return starts.map((k) => byKey.get(k) ?? 0);
}

/**
 * One bucketed count over a timestamp column, oldest bucket first.
 *
 * `unit` is interpolated with `sql.raw` rather than bound: Postgres cannot
 * infer the type of a parameter in `date_trunc($1, ...)` and rejects the whole
 * statement. It is safe to inline because the parameter's type admits exactly
 * two literals, neither of which reaches this function from a request.
 *
 * `AT TIME ZONE 'UTC'` pins the truncation to UTC instead of the database
 * session's zone, so a bucket means the same thing wherever this runs.
 */
async function bucketed(
  table: PgTable,
  column: AnyPgColumn,
  unit: 'week' | 'month',
  since: Date,
  extra?: SQL,
): Promise<Bucket[]> {
  const bucket = sql<string>`to_char(date_trunc('${sql.raw(unit)}', ${column} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ bucket, c: count() })
    .from(table)
    .where(and(gte(column, since), extra))
    .groupBy(bucket);
  return rows as Bucket[];
}

/** Two adjacent windows of equal length over one timestamp column. */
async function windows(
  table: PgTable,
  column: AnyPgColumn,
  from: Date,
  mid: Date,
  to: Date,
  extra?: SQL,
): Promise<{ current: number; previous: number }> {
  const span = (lo: Date, hi: Date) => and(gte(column, lo), lt(column, hi), extra);
  const [[cur], [prev]] = await Promise.all([
    db.select({ c: count() }).from(table).where(span(mid, to)),
    db.select({ c: count() }).from(table).where(span(from, mid)),
  ]);
  return { current: Number(cur.c), previous: Number(prev.c) };
}

export const GET = handle(async (request) => {
  await requireAdmin(request);

  const now = new Date();
  const weeks = weekStarts(now, WEEK_BUCKETS);
  const months = monthStarts(now, MONTH_BUCKETS);
  const at = (days: number) => new Date(now.getTime() + days * DAY);

  const posted = emergencyRequests.postedAt;
  const critical = eq(emergencyRequests.urgency, 'critical');
  const confirmed = eq(appointments.status, 'confirmed');
  const weekFloor = new Date(`${weeks[0]}T00:00:00.000Z`);
  const monthFloor = new Date(`${months[0]}T00:00:00.000Z`);

  const [
    requestBuckets,
    criticalBuckets,
    donorBuckets,
    appointmentBuckets,
    requestWindow,
    criticalWindow,
    donorWindow,
    appointmentWindow,
  ] = await Promise.all([
    bucketed(emergencyRequests, posted, 'week', weekFloor),
    bucketed(emergencyRequests, posted, 'week', weekFloor, critical),
    bucketed(authUser, authUser.createdAt, 'month', monthFloor),
    bucketed(appointments, appointments.date, 'week', weekFloor, confirmed),
    windows(emergencyRequests, posted, at(-14), at(-7), now),
    windows(emergencyRequests, posted, at(-14), at(-7), now, critical),
    windows(authUser, authUser.createdAt, at(-60), at(-30), now),
    // Appointments look forward: the useful comparison is what is booked for
    // the coming week against what the last week actually held.
    windows(appointments, appointments.date, at(-7), now, at(7), confirmed),
  ]);

  const trend = (
    rows: Bucket[],
    starts: string[],
    w: { current: number; previous: number },
  ): AdminTrend => ({ ...w, series: toSeries(rows, starts) });

  return json<AdminTrendsResponse>({
    requestsWeekly: trend(requestBuckets, weeks, requestWindow),
    criticalWeekly: trend(criticalBuckets, weeks, criticalWindow),
    donorsMonthly: trend(donorBuckets, months, donorWindow),
    appointmentsWeekly: trend(appointmentBuckets, weeks, appointmentWindow),
  });
});
