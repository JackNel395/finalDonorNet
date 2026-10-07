/**
 * RECOVERED SCHEMA — "center operations". A DESIGN RECORD, NOT LIVE CODE.
 *
 * ✅ RESOLVED 2026-10-07: the tables below were DROPPED from the database and
 * this feature is NOT part of Blood Bridge. This file is kept as the only
 * surviving description of a design worth revisiting — nothing imports it,
 * `drizzle.config.ts` points only at `src/db/schema.ts`, and `npm run db:push`
 * now reports "No changes detected" with no destructive prompt.
 *
 * ── Why it was dropped ──────────────────────────────────────────────────────
 * The database contained a complete, coherent feature that existed in NO commit
 * on either remote, in no transcript, and in no file on this machine. It was
 * built in the working tree, pushed to the database, run live for two to three
 * days in July 2026, and discarded without ever being committed.
 *
 * It was dropped because: it existed in no commit; all 68 rows were SEED data
 * (the 32 `inventory` rows share one timestamp two seconds after the demo users
 * were created); no code referenced it; and as undeclared schema it made the
 * project's own documented `npm run db:push` destructive — it offered to drop
 * two tables holding data. It had already caused one concrete error:
 * `adminPlan.md` asserted "there is no role, permission, or admin concept
 * anywhere today", which was true of the codebase and false of the database.
 *
 * ── What was dropped, and when ──────────────────────────────────────────────
 *   2026-10-07, earlier: `profiles.role`, `profiles.staff_center_id`, the
 *     `user_role` enum, and five columns (`donations.method`,
 *     `donations.verified_by_center_id`, `donations.verified_at`,
 *     `donation_centers.phone`, `emergency_requests.escalated_at`).
 *   2026-10-07, after the admin console's phase 3: the `inventory` (32 rows) and
 *     `request_centers` (36 rows) tables, and the now-orphaned `stock_level`,
 *     `center_response`, and `donation_method` enum types. Dependencies were
 *     checked first: each enum was used only by the table dropped alongside it.
 *
 * ── How to recover ──────────────────────────────────────────────────────────
 * Snapshot `before-drift-column-drop` (snap-plain-art-azwljwp9), taken
 * 2026-10-06T22:35:14Z, predates every drop and is the complete pre-drop state.
 * `recovered-center-ops-restore.sql` restores the two `profiles` columns exactly.
 * To revive the tables, paste the definitions below into `src/db/schema.ts` and
 * restore their rows from the snapshot.
 *
 * ── What the feature did ────────────────────────────────────────────────────
 * Centers hold per-blood-type stock levels. An emergency request is escalated to
 * nearby centers, each center is notified and responds with whether it can cover
 * and for how many units, and staff accounts are scoped to a single center.
 * Donations could additionally be verified by a center scan rather than only
 * self-reported.
 *
 * ── Worth revisiting ────────────────────────────────────────────────────────
 * Dropping this implementation does not rule out the capability. Today
 * `POST /api/requests` fans push to every compatible donor within 50 km
 * (`src/lib/server/push.ts`). Escalating to centers that actually hold stock is
 * a materially better first step than waking hundreds of donors, and
 * `request_centers` is a reasonable shape for it. If it is ever revived, note
 * that it OVERLAPS the admin console's phase 1: a request taken down by staff
 * would need its outstanding center notifications resolved too, so
 * `/api/admin/requests/[id]/moderate` would have to account for them.
 *
 * ── Evidence of origin (kept for the record) ────────────────────────────────
 *   • All 32 `inventory` rows shared one timestamp, 2026-07-23 06:25:52Z — two
 *     seconds after the demo users were created. A seed-script run.
 *   • `request_centers` began three seconds later, 06:25:55Z.
 *   • Last commit on any branch: 2026-07-22 07:04. The seed ran a day AFTER it.
 *   • `request_centers.responded_at` spanned 06:36–06:45 on 2026-07-23, and one
 *     row was notified as late as 2026-07-25 — so the app was live against it.
 *   • Constraint names matched drizzle-kit's auto-generated convention exactly
 *     (`inventory_center_id_donation_centers_id_fk`), so the lost source was a
 *     Drizzle schema file, not hand-written SQL.
 */
import { relations } from 'drizzle-orm';
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { bloodTypeEnum, donationCenters, emergencyRequests } from './src/db/schema';

/** Mirrors the private `id()` helper in src/db/schema.ts. */
const id = (prefix: string) =>
  text('id')
    .primaryKey()
    .$defaultFn(() => `${prefix}_${crypto.randomUUID()}`);

const tz = { withTimezone: true } as const;

// ─── Enums (all four still exist in the database) ──────────────────────────────

/**
 * ⚠️  DROPPED 2026-10-07. This was a SECOND role mechanism, competing
 * with the `user.role` that phase 0 of adminPlan.md added via the Better Auth
 * admin() plugin. The plan asserted "there is no role, permission, or admin
 * concept anywhere today" — true of the codebase, false of the database.
 *
 * `profiles.role` and `profiles.staff_center_id` have been dropped, along with
 * this now-orphaned `user_role` type, so Better Auth's `user.role` is the single
 * role mechanism. All 21 rows were 'member' and nobody held 'admin', so no
 * access changed. Restore with recovered-center-ops-restore.sql.
 *
 * The definition is kept here only so the feature can be revived whole.
 */
export const userRoleEnum = pgEnum('user_role', ['member', 'admin']);

export const stockLevelEnum = pgEnum('stock_level', ['critical', 'low', 'adequate']);

export const centerResponseEnum = pgEnum('center_response', [
  'notified',
  'can_cover',
  'no_stock',
  'declined',
]);

/** Backed the dropped `donations.method` column. The enum type itself survives. */
export const donationMethodEnum = pgEnum('donation_method', ['self', 'center_scan']);

// ─── Tables ───────────────────────────────────────────────────────────────────

/**
 * Per-center stock, one row per (center, blood type). 32 live rows: four centers
 * × all eight blood types, so the grid is complete and dense rather than sparse.
 * Seeded distribution is realistic — mostly 'adequate', one 'critical' at three
 * of the four centers.
 *
 * `level` is a coarse band, not a unit count. That is a deliberate privacy and
 * accuracy choice: a center will publish "low" long before it will publish an
 * exact inventory figure, and a stale exact number is worse than an honest band.
 */
export const inventory = pgTable(
  'inventory',
  {
    id: id('inv'),
    centerId: text('center_id')
      .notNull()
      .references(() => donationCenters.id, { onDelete: 'cascade' }),
    bloodType: bloodTypeEnum('blood_type').notNull(),
    level: stockLevelEnum('level').notNull(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('inventory_center_type_unique').on(t.centerId, t.bloodType)],
);

/**
 * Escalation of an emergency request to a center: the join row that records that
 * a center was notified and what it answered. 36 live rows — 34 still 'notified',
 * 2 'can_cover' totalling 5 units offered, both with a `responded_at`.
 *
 * ⚠️  This OVERLAPS adminPlan.md phase 1. Both this table and the planned
 * moderation surface decide what happens to an emergency request, and a request
 * taken down by staff would need its outstanding center notifications resolved
 * too. If the feature is revived, phase 1's `moderate` route has to account for
 * it; if it is dropped, phase 1 is unaffected.
 */
export const requestCenters = pgTable(
  'request_centers',
  {
    id: id('rqc'),
    requestId: text('request_id')
      .notNull()
      .references(() => emergencyRequests.id, { onDelete: 'cascade' }),
    centerId: text('center_id')
      .notNull()
      .references(() => donationCenters.id, { onDelete: 'cascade' }),
    status: centerResponseEnum('status').notNull().default('notified'),
    unitsOffered: integer('units_offered').notNull().default(0),
    notifiedAt: timestamp('notified_at', tz).notNull().defaultNow(),
    // Null until the center answers; set on any non-'notified' status.
    respondedAt: timestamp('responded_at', tz),
  },
  (t) => [uniqueIndex('request_centers_request_center_unique').on(t.requestId, t.centerId)],
);

export const inventoryRelations = relations(inventory, ({ one }) => ({
  center: one(donationCenters, {
    fields: [inventory.centerId],
    references: [donationCenters.id],
  }),
}));

export const requestCentersRelations = relations(requestCenters, ({ one }) => ({
  request: one(emergencyRequests, {
    fields: [requestCenters.requestId],
    references: [emergencyRequests.id],
  }),
  center: one(donationCenters, {
    fields: [requestCenters.centerId],
    references: [donationCenters.id],
  }),
}));

/*
 * ─── Columns formerly on `profiles` — DROPPED 2026-10-07 ─────────────────────
 * Removed as the duplicate role mechanism; see userRoleEnum above. Restore with
 * recovered-center-ops-restore.sql, which also recreates the `user_role` type.
 * To revive them in code, add these two fields to `profiles` in src/db/schema.ts:
 *
 *   role: userRoleEnum('role').notNull().default('member'),
 *   staffCenterId: text('staff_center_id')
 *     .references(() => donationCenters.id, { onDelete: 'set null' }),
 *
 * State at the time of the drop: all 21 rows 'member'. Four had a
 * `staff_center_id`, one per center — the demo operator accounts:
 *   operator.redcross@bloodbridge.demo  → Philippine Red Cross – Cebu Chapter
 *   operator.vsmmc@bloodbridge.demo     → Vicente Sotto Memorial Medical Center
 *   operator.ucmed@bloodbridge.demo     → University of Cebu Medical Center
 *   operator.mactan@bloodbridge.demo    → Mactan Doctors' Hospital
 *
 * ─── Columns DROPPED on 2026-10-07, recoverable from snapshot ─────────────────
 * Snapshot `before-drift-column-drop` (snap-plain-art-azwljwp9) predates the drop.
 * Types below are INFERRED from the surviving enum types, drizzle's constraint
 * naming, and the data that was in them — not read from a live catalog, because
 * the columns no longer exist. Verify against the snapshot before relying on them.
 *
 *   donations.method                → donationMethodEnum, notNull, default 'self'
 *                                     (all 10 rows were 'self')
 *   donations.verifiedAt            → timestamp(tz), nullable (0 of 10 set)
 *   donations.verifiedByCenterId    → text → donation_centers.id, nullable
 *                                     (0 of 10 set)
 *   emergencyRequests.escalatedAt   → timestamp(tz), nullable (1 of 13 set)
 *   donationCenters.phone           → text, likely notNull (5 of 5 set, all the
 *                                     `555` non-dialable seed placeholders)
 */
