/**
 * Drizzle schema — single source of truth for the DonorNet database.
 * Domain tables mirror src/types/domain.ts; auth tables live in auth-schema.ts.
 * Server-only: never import this from client code.
 */
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth-schema';

export * from './auth-schema';

/** Prefixed text ids (req_..., don_...) keep ids readable in logs and URLs. */
const id = (prefix: string) =>
  text('id')
    .primaryKey()
    .$defaultFn(() => `${prefix}_${crypto.randomUUID()}`);

const tz = { withTimezone: true } as const;

// Enums mirror the string unions in src/types/domain.ts.
export const bloodTypeEnum = pgEnum('blood_type', [
  'O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+',
]);
export const urgencyEnum = pgEnum('urgency', ['critical', 'urgent', 'moderate', 'routine']);
export const requestStatusEnum = pgEnum('request_status', [
  'open', 'partial', 'fulfilled', 'expired',
]);
export const genderEnum = pgEnum('gender', ['male', 'female', 'other', 'prefer_not']);
export const donationTypeEnum = pgEnum('donation_type', [
  'whole', 'plasma', 'platelets', 'power_red',
]);
export const responderStatusEnum = pgEnum('responder_status', ['offered', 'confirmed']);
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'confirmed', 'pending', 'completed', 'cancelled',
]);
export const centerKindEnum = pgEnum('center_kind', ['hospital', 'blood_bank', 'campaign']);
export const announcementToneEnum = pgEnum('announcement_tone', [
  'brand', 'info', 'success', 'warning',
]);
export const articleCategoryEnum = pgEnum('article_category', [
  'eligibility', 'process', 'health', 'myths',
]);

/** 1:1 with the auth user; fullName/email live on `user`. */
export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  bloodType: bloodTypeEnum('blood_type').notNull(),
  phone: text('phone').notNull(),
  city: text('city').notNull(),
  region: text('region'),
  gender: genderEnum('gender'),
  dateOfBirth: date('date_of_birth'),
  avatarColor: text('avatar_color'),
  weightKg: integer('weight_kg'),
  // Donor's last-known location, fuzzed to ~1 km; never serialized to any client.
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  lastDonationDate: timestamp('last_donation_date', tz),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
});

export const emergencyRequests = pgTable('emergency_requests', {
  id: id('req'),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  patientInitials: text('patient_initials').notNull(),
  bloodType: bloodTypeEnum('blood_type').notNull(),
  unitsNeeded: integer('units_needed').notNull(),
  unitsFulfilled: integer('units_fulfilled').notNull().default(0),
  urgency: urgencyEnum('urgency').notNull(),
  hospital: text('hospital').notNull(),
  city: text('city').notNull(),
  // Fallback distance (stable per-city hash) used whenever either side lacks coords.
  distanceKm: real('distance_km').notNull(),
  // Hospital location, optional: only set when the creator attaches their device location.
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  neededBy: timestamp('needed_by', tz).notNull(),
  postedAt: timestamp('posted_at', tz).notNull().defaultNow(),
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  note: text('note'),
  status: requestStatusEnum('status').notNull().default('open'),
});

export const responders = pgTable(
  'responders',
  {
    id: id('rsp'),
    requestId: text('request_id')
      .notNull()
      .references(() => emergencyRequests.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: responderStatusEnum('status').notNull().default('offered'),
    respondedAt: timestamp('responded_at', tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('responders_request_user_unique').on(t.requestId, t.userId)],
);

/**
 * Expo push tokens, one row per device. Separate from `profiles` so a user can
 * register several devices, and a dead token can be pruned per-device (on an
 * Expo `DeviceNotRegistered` receipt) without touching the profile.
 */
export const pushTokens = pgTable('push_tokens', {
  id: id('ptk'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(), // ExponentPushToken[...]
  platform: text('platform').notNull(), // 'ios' | 'android'
  updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
});

export const donations = pgTable('donations', {
  id: id('don'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  date: timestamp('date', tz).notNull(),
  // Denormalized: donations may predate centers or happen elsewhere.
  centerName: text('center_name').notNull(),
  city: text('city').notNull(),
  units: integer('units').notNull(),
  type: donationTypeEnum('type').notNull(),
});

export const donationCenters = pgTable('donation_centers', {
  id: id('ctr'),
  name: text('name').notNull(),
  kind: centerKindEnum('kind').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  distanceKm: real('distance_km').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  openNow: boolean('open_now').notNull().default(true),
  hours: text('hours').notNull(),
  rating: real('rating').notNull(),
  needsUrgent: bloodTypeEnum('needs_urgent').array(),
});

export const appointments = pgTable('appointments', {
  id: id('apt'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  centerId: text('center_id')
    .notNull()
    .references(() => donationCenters.id, { onDelete: 'cascade' }),
  date: timestamp('date', tz).notNull(),
  status: appointmentStatusEnum('status').notNull().default('confirmed'),
  type: donationTypeEnum('type').notNull(),
});

export const announcements = pgTable('announcements', {
  id: id('ann'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  tag: text('tag').notNull(),
  date: timestamp('date', tz).notNull().defaultNow(),
  tone: announcementToneEnum('tone').notNull(),
});

export const educationArticles = pgTable('education_articles', {
  id: id('art'),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  minutes: integer('minutes').notNull(),
  category: articleCategoryEnum('category').notNull(),
  icon: text('icon').notNull(),
  body: text('body').array().notNull(),
});

/**
 * Every admin mutation writes one row here, in the same request handler as the
 * mutation itself. The record must outlive what it describes, which drives two
 * deliberate exceptions to how the rest of this schema is shaped:
 *   - `actorId` is nullable with `onDelete: 'set null'` — deleting an admin
 *     account must not erase the history of the actions they took.
 *   - `targetId` is plain text with no FK — account deletion cascades, and the
 *     audit row has to survive its target.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: id('adt'),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    // Dotted verb naming the capability, e.g. 'request.takedown'.
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason'),
    // Snapshot of what changed; for a delete, the identifying fields, since
    // afterwards there is nothing left to point at.
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (t) => [
    index('admin_audit_log_target_idx').on(t.targetType, t.targetId),
    index('admin_audit_log_created_at_idx').on(t.createdAt),
  ],
);
