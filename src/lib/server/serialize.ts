/**
 * Row → domain-type mappers. Drizzle returns Date objects for timestamptz
 * columns while the client domain types use ISO strings, so all serialization
 * happens here in one place. Server-only.
 */
import type {
  adminAuditLog,
  announcements,
  appointments,
  donationCenters,
  donations,
  educationArticles,
  emergencyRequests,
  profiles,
} from '@/db/schema';
import { type Coords, haversineKm, roundCoord } from '@/lib/geo';
import type {
  AdminAppointment,
  AdminCenter,
  AdminDonor,
  AdminRequest,
  AdminResponder,
  AuditEntry,
} from '@/types/api';
import type {
  Announcement,
  Appointment,
  Donation,
  DonationCenter,
  EducationArticle,
  EmergencyRequest,
  Responder,
  UserProfile,
} from '@/types/domain';

type ProfileRow = typeof profiles.$inferSelect;
type RequestRow = typeof emergencyRequests.$inferSelect;
type CenterRow = typeof donationCenters.$inferSelect;
type AppointmentRow = typeof appointments.$inferSelect;
type DonationRow = typeof donations.$inferSelect;
type AnnouncementRow = typeof announcements.$inferSelect;
type ArticleRow = typeof educationArticles.$inferSelect;
type AuditRow = typeof adminAuditLog.$inferSelect;

/** Nullable row coords → Coords, or null when either half is missing. */
function rowCoords(row: { latitude: number | null; longitude: number | null }): Coords | null {
  if (row.latitude == null || row.longitude == null) return null;
  return { latitude: row.latitude, longitude: row.longitude };
}

/**
 * Real distance when both endpoints have coordinates, else the stored per-city
 * fallback. Callers can't tell the two apart — that's deliberate, so every
 * screen works without conditional logic.
 */
function distanceFrom(
  from: Coords | null | undefined,
  to: Coords | null,
  fallbackKm: number,
): number {
  return from && to ? haversineKm(from, to) : fallbackKm;
}

export function toProfile(
  u: { id: string; name: string; email: string },
  p: ProfileRow,
): UserProfile {
  return {
    id: u.id,
    fullName: u.name,
    email: u.email,
    phone: p.phone,
    bloodType: p.bloodType,
    gender: p.gender ?? undefined,
    dateOfBirth: p.dateOfBirth ?? undefined,
    city: p.city,
    region: p.region ?? undefined,
    avatarColor: p.avatarColor ?? undefined,
    health: p.weightKg != null ? { weightKg: p.weightKg } : undefined,
    lastDonationDate: p.lastDonationDate ? p.lastDonationDate.toISOString() : undefined,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toEmergencyRequest(
  r: RequestRow,
  respondersCount: number,
  viewer?: Coords | null,
): EmergencyRequest {
  const coords = rowCoords(r);
  return {
    id: r.id,
    ownerId: r.ownerId,
    patientInitials: r.patientInitials,
    bloodType: r.bloodType,
    unitsNeeded: r.unitsNeeded,
    unitsFulfilled: r.unitsFulfilled,
    urgency: r.urgency,
    hospital: r.hospital,
    city: r.city,
    distanceKm: distanceFrom(viewer, coords, r.distanceKm),
    // Fuzz request coords to ~110 m: they come from the creator's device, which
    // is usually the hospital but could be their home. Exact coords stay server-side.
    latitude: coords ? roundCoord(coords.latitude, 3) : undefined,
    longitude: coords ? roundCoord(coords.longitude, 3) : undefined,
    neededBy: r.neededBy.toISOString(),
    postedAt: r.postedAt.toISOString(),
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    note: r.note ?? undefined,
    status: r.status,
    respondersCount,
  };
}

/**
 * Owner-facing responder row assembled from a responders ⋈ user ⋈ profiles join.
 * The distance shown is donor→hospital (how far this donor must travel), not
 * viewer→anything; it falls back to the request's stored distance whenever
 * either the donor's or the hospital's coordinates are missing.
 */
export function toResponder(
  row: {
    id: string;
    fullName: string;
    bloodType: Responder['bloodType'];
    city: string;
    avatarColor: string | null;
    respondedAt: Date;
    status: Responder['status'];
    latitude: number | null;
    longitude: number | null;
  },
  fallbackDistanceKm: number,
  requestCoords?: Coords | null,
): Responder {
  return {
    id: row.id,
    fullName: row.fullName,
    bloodType: row.bloodType,
    city: row.city,
    distanceKm: distanceFrom(rowCoords(row), requestCoords ?? null, fallbackDistanceKm),
    avatarColor: row.avatarColor ?? undefined,
    respondedAt: row.respondedAt.toISOString(),
    status: row.status,
  };
}

export function toAppointment(a: AppointmentRow, c: CenterRow): Appointment {
  return {
    id: a.id,
    centerName: c.name,
    address: c.address,
    date: a.date.toISOString(),
    status: a.status,
    type: a.type,
  };
}

export function toDonation(d: DonationRow): Donation {
  return {
    id: d.id,
    date: d.date.toISOString(),
    centerName: d.centerName,
    city: d.city,
    units: d.units,
    type: d.type,
  };
}

export function toCenter(c: CenterRow, viewer?: Coords | null): DonationCenter {
  const coords = rowCoords(c);
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    address: c.address,
    city: c.city,
    distanceKm: distanceFrom(viewer, coords, c.distanceKm),
    // Centers are public places — exact coords, no fuzzing.
    latitude: coords?.latitude,
    longitude: coords?.longitude,
    openNow: c.openNow,
    hours: c.hours,
    rating: c.rating,
    needsUrgent: c.needsUrgent ?? undefined,
  };
}

export function toAnnouncement(a: AnnouncementRow): Announcement {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    tag: a.tag,
    date: a.date.toISOString(),
    tone: a.tone,
  };
}

export function toArticle(a: ArticleRow): EducationArticle {
  return {
    id: a.id,
    title: a.title,
    summary: a.summary,
    minutes: a.minutes,
    category: a.category,
    icon: a.icon,
    body: a.body,
  };
}

/**
 * Deterministic distance (km) derived from the city name — stable per city.
 * Still seeds `distance_km` on create; it is the fallback whenever real
 * coordinates are unavailable on either end. Range ~1.0–12.0.
 */
export function cityDistanceKm(city: string): number {
  let h = 0;
  for (let i = 0; i < city.length; i += 1) h = (h * 31 + city.charCodeAt(i)) % 997;
  return Math.round((1 + (h / 997) * 11) * 10) / 10;
}

// --- Operations console ------------------------------------------------------
// Admin responses differ in shape from donor-facing ones, so they get their own
// mappers here rather than inline shaping in a route. None of them emits a
// coordinate: `profiles.latitude/longitude` never leave the server, and the
// hospital coords on a request are no different. Distance comes from the same
// `distanceFrom` path donors go through.

/**
 * A request for staff, with the owner's identity attached. `hasCoordinates`
 * reports whether the distances on this row are real or the per-city fallback —
 * the only thing staff need to know about the stored location.
 */
export function toAdminRequest(
  r: RequestRow,
  respondersCount: number,
  owner: { name: string; email: string },
): AdminRequest {
  return {
    id: r.id,
    ownerId: r.ownerId,
    ownerName: owner.name,
    ownerEmail: owner.email,
    patientInitials: r.patientInitials,
    bloodType: r.bloodType,
    unitsNeeded: r.unitsNeeded,
    unitsFulfilled: r.unitsFulfilled,
    urgency: r.urgency,
    hospital: r.hospital,
    city: r.city,
    distanceKm: r.distanceKm,
    hasCoordinates: rowCoords(r) != null,
    neededBy: r.neededBy.toISOString(),
    postedAt: r.postedAt.toISOString(),
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    note: r.note ?? undefined,
    status: r.status,
    respondersCount,
  };
}

/**
 * A responder for staff, assembled from a responders ⋈ user ⋈ profiles join.
 * Widens `toResponder` with email and phone — staff cannot reach a donor
 * without them — and keeps the same donor→hospital distance semantics.
 */
export function toAdminResponder(
  row: {
    id: string;
    userId: string;
    fullName: string;
    email: string;
    phone: string | null;
    bloodType: AdminResponder['bloodType'];
    city: string;
    respondedAt: Date;
    status: AdminResponder['status'];
    latitude: number | null;
    longitude: number | null;
  },
  fallbackDistanceKm: number,
  requestCoords?: Coords | null,
): AdminResponder {
  return {
    id: row.id,
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone ?? undefined,
    bloodType: row.bloodType,
    city: row.city,
    distanceKm: distanceFrom(rowCoords(row), requestCoords ?? null, fallbackDistanceKm),
    respondedAt: row.respondedAt.toISOString(),
    status: row.status,
  };
}

/** An audit row with the acting admin resolved to a name where they still exist. */
export function toAuditEntry(row: AuditRow, actorName?: string | null): AuditEntry {
  return {
    id: row.id,
    actorId: row.actorId ?? undefined,
    actorName: actorName ?? undefined,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A donor for staff. Assembled from a `user ⋈ profiles` left join, so every
 * field the profile owns is optional: an account can exist without a profile
 * row (signed up, never finished onboarding) and staff still need to see it —
 * that gap is itself operational information, not a reason to drop the row.
 *
 * `hasLocation` replaces the coordinates entirely. Staff learn whether a stored
 * location exists, which is all that affects how donors are matched; the
 * coordinates themselves stay on the server, unchanged by the console.
 */
export function toAdminDonor(
  u: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    banned: boolean | null;
    banReason: string | null;
    banExpires: Date | null;
  },
  p: ProfileRow | null,
  deviceCount: number,
): AdminDonor {
  return {
    id: u.id,
    fullName: u.name,
    email: u.email,
    phone: p?.phone ?? undefined,
    bloodType: p?.bloodType ?? undefined,
    city: p?.city ?? undefined,
    region: p?.region ?? undefined,
    avatarColor: p?.avatarColor ?? undefined,
    lastDonationDate: p?.lastDonationDate ? p.lastDonationDate.toISOString() : undefined,
    hasLocation: p ? rowCoords(p) != null : false,
    deviceCount,
    hasProfile: p != null,
    // `banned` is nullable in the plugin's schema; absent means not banned.
    banned: u.banned === true,
    banReason: u.banReason ?? undefined,
    banExpires: u.banExpires ? u.banExpires.toISOString() : undefined,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * A center for staff: the donor-facing shape plus the one fact that governs
 * whether it can be deleted. Coordinates are intentional here — centers are
 * public places and `toCenter` already emits them unrounded for the donor map.
 */
export function toAdminCenter(c: CenterRow, upcomingAppointments: number): AdminCenter {
  return { ...toCenter(c), upcomingAppointments };
}

/**
 * An appointment for staff, from an `appointments ⋈ donation_centers ⋈ user`
 * join with an optional profile. Unlike `toAppointment` it names the donor:
 * staff acting on someone else's booking need to know whose it is, and need to
 * be able to reach them.
 */
export function toAdminAppointment(
  a: AppointmentRow,
  c: CenterRow,
  donor: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    bloodType: AdminDonor['bloodType'] | null;
    /**
     * The donor's own pick from profile setup, so the console's avatars are the
     * ones the donor app draws rather than a colour derived from their name.
     * Null until they finish a profile.
     */
    avatarColor?: string | null;
  },
): AdminAppointment {
  return {
    id: a.id,
    centerId: c.id,
    centerName: c.name,
    centerCity: c.city,
    address: c.address,
    donorId: donor.id,
    donorName: donor.name,
    donorEmail: donor.email,
    donorPhone: donor.phone ?? undefined,
    donorBloodType: donor.bloodType ?? undefined,
    donorAvatarColor: donor.avatarColor ?? undefined,
    date: a.date.toISOString(),
    status: a.status,
    type: a.type,
  };
}
