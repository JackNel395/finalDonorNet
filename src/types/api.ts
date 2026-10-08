/**
 * API request/response contract types shared between the server routes and the
 * client fetch layer. Domain shapes live in ./domain; these describe the wire
 * envelopes and mutation bodies.
 */
import type {
  Announcement,
  Appointment,
  BloodType,
  DonationCenter,
  Donation,
  EducationArticle,
  EmergencyRequest,
  Gender,
  RequestStatus,
  Urgency,
} from './domain';

/** Standard error envelope returned by every API route on failure. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** A feed request annotated with the current user's own response, if any. */
export type RequestWithMine = EmergencyRequest & {
  myResponse: { status: 'offered' | 'confirmed' } | null;
};

export interface CreateProfileBody {
  fullName: string;
  bloodType: BloodType;
  phone: string;
  city: string;
  region?: string;
  gender?: Gender;
  dateOfBirth?: string; // ISO date
  avatarColor?: string;
  weightKg?: number;
  /**
   * Optional device coords; stored fuzzed (~1 km) server-side and never
   * serialized back to any client. Send null to clear a stored location.
   */
  latitude?: number | null;
  longitude?: number | null;
}

export type UpdateProfileBody = Partial<CreateProfileBody>;

export interface CreateRequestBody {
  patientInitials?: string;
  bloodType: BloodType;
  unitsNeeded: number;
  urgency: Urgency;
  hospital: string;
  city: string;
  neededBy?: string; // ISO; defaults to +12h server-side
  contactName?: string;
  contactPhone: string;
  note?: string;
  /** Optional hospital coords from the creator's device; dropped if invalid. */
  latitude?: number;
  longitude?: number;
}

export interface CreateAppointmentBody {
  centerId: string;
  date: string; // ISO datetime
  type?: Donation['type'];
}

// --- Operations console (web-only /admin) -----------------------------------
// Admin wire shapes live here beside the donor-facing ones. None of them carry
// a donor coordinate: `profiles.latitude/longitude` never leave the server, and
// admin surfaces receive the same derived `distanceKm` donors receive.

/** GET /api/admin/me — the console gate. 403 for a signed-in non-admin. */
export interface AdminMeResponse {
  role: string;
}

/**
 * One tile on the console's overview: a count now, the direction it moved, and
 * a short series to draw behind it.
 *
 * `current` and `previous` are counts over two adjacent windows of equal
 * length, so the console can state a change without the server deciding how to
 * phrase it. `series` is oldest-first and has no units of its own — it exists
 * to be drawn, never to be read as a figure.
 */
export interface AdminTrend {
  current: number;
  previous: number;
  series: number[];
}

/**
 * GET /api/admin/overview/trends — movement behind the four overview tiles.
 *
 * Separate from the `total` each list route already returns: a total is the
 * state now, and these are the same quantity over time. Every one is measured
 * from a real timestamp column (`user.createdAt`, `emergency_requests.postedAt`,
 * `appointments.date`), and the window each covers is named in the field, so a
 * tile can label precisely what moved rather than implying a general trend.
 */
export interface AdminTrendsResponse {
  /** Requests posted, by week, over 8 weeks. Windows: 7 days vs the 7 before. */
  requestsWeekly: AdminTrend;
  /** Critical requests posted, same windows. */
  criticalWeekly: AdminTrend;
  /** Accounts created, by month, over 6 months. Windows: 30 days vs the 30 before. */
  donorsMonthly: AdminTrend;
  /** Confirmed appointments, by week, over 8 weeks. Windows: next 7 days vs the last 7. */
  appointmentsWeekly: AdminTrend;
}

// --- Phase 1: requests moderation -------------------------------------------

/**
 * A request as staff see it: every donor-facing field plus the owner's identity
 * and a responder count. No coordinate: the hospital's exact location stays on
 * the server, and `hasCoordinates` is the only thing admin needs to know about
 * it (whether distances on this row are real or the per-city fallback).
 */
export interface AdminRequest {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  patientInitials: string;
  bloodType: BloodType;
  unitsNeeded: number;
  unitsFulfilled: number;
  urgency: Urgency;
  hospital: string;
  city: string;
  distanceKm: number;
  hasCoordinates: boolean;
  neededBy: string; // ISO
  postedAt: string; // ISO
  contactName: string;
  contactPhone: string;
  note?: string;
  status: RequestStatus;
  respondersCount: number;
}

/**
 * A responder as staff see it. Widens the donor-facing `Responder` with the
 * contact details staff need to verify a request or reach a donor — the
 * operational justification for the console existing. Still no coordinate:
 * `distanceKm` is derived server-side, exactly as donors receive it.
 */
export interface AdminResponder {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  bloodType: BloodType;
  city: string;
  distanceKm: number;
  respondedAt: string; // ISO
  status: 'offered' | 'confirmed';
}

/** One `admin_audit_log` row, with the acting admin resolved to a name. */
export interface AuditEntry {
  id: string;
  /** Null once the acting admin's account is deleted; the record survives them. */
  actorId?: string;
  actorName?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string; // ISO
}

export type AdminRequestDetail = AdminRequest & {
  responders: AdminResponder[];
  auditTrail: AuditEntry[];
};

/** Server-side pagination from the start: this table has no natural ceiling. */
export interface AdminRequestListResponse {
  rows: AdminRequest[];
  total: number;
}

/** Query params for GET /api/admin/requests. All optional. */
export interface AdminRequestFilters {
  /** Free text over hospital, city, patient initials, and the request id. */
  q?: string;
  status?: RequestStatus;
  urgency?: Urgency;
  bloodType?: BloodType;
  city?: string;
  postedWithinDays?: number;
  /** Defaults to 'newest' server-side. */
  sort?: 'newest' | 'oldest';
  limit?: number;
  offset?: number;
}

/**
 * `verify` is an attestation, not a status: `request_status` has no `verified`
 * member, so it records an audit row and changes nothing else. `expire` and
 * `takedown` both close the request — they differ in intent and in `takedown`
 * requiring a reason. A take-down never deletes the row.
 */
export type ModerateAction = 'verify' | 'expire' | 'fulfill' | 'takedown';

export interface ModerateRequestBody {
  action: ModerateAction;
  /** Required for `takedown`. */
  reason?: string;
}

// --- Phase 2: users and donors ----------------------------------------------

/**
 * A donor as staff see them in the list. Widens `toProfile`'s output with the
 * contact details and account state staff need to verify a request or reach a
 * donor — the deliberate, recorded widening the console exists for. Still no
 * coordinate: `profiles.latitude/longitude` never leave the server, and
 * `hasLocation` is the only thing admin learns about a stored location.
 */
export interface AdminDonor {
  id: string;
  fullName: string;
  email: string;
  /** Null for an account that signed up but never completed a profile. */
  phone?: string;
  bloodType?: BloodType;
  city?: string;
  region?: string;
  /** The donor's own pick from profile setup; absent until they finish one. */
  avatarColor?: string;
  lastDonationDate?: string; // ISO
  /** Whether a (fuzzed) location is stored at all — never the location itself. */
  hasLocation: boolean;
  /** Registered devices, counted from `push_tokens`. */
  deviceCount: number;
  /** False for a signed-up account with no `profiles` row yet. */
  hasProfile: boolean;
  banned: boolean;
  banReason?: string;
  banExpires?: string; // ISO
  createdAt: string; // ISO
}

/** One registered device, for the detail view's device list. */
export interface AdminDonorDevice {
  id: string;
  platform: string;
  updatedAt: string; // ISO
}

/**
 * A donor's full record: the account, their donation history, their
 * appointments, and the requests they responded to — everything staff need to
 * judge an account without a SQL prompt.
 */
export type AdminDonorDetail = AdminDonor & {
  donations: Donation[];
  appointments: Appointment[];
  responses: AdminDonorResponse[];
  devices: AdminDonorDevice[];
  auditTrail: AuditEntry[];
};

/** A request this donor offered to give for. */
export interface AdminDonorResponse {
  id: string;
  requestId: string;
  hospital: string;
  city: string;
  bloodType: BloodType;
  urgency: Urgency;
  requestStatus: RequestStatus;
  status: 'offered' | 'confirmed';
  respondedAt: string; // ISO
}

export interface AdminDonorListResponse {
  rows: AdminDonor[];
  total: number;
}

/**
 * Account state as a filter. The three values are the same three the list
 * renders, so what staff can see they can also narrow to: `incomplete` is a
 * signup with no `profiles` row, and is operational information rather than an
 * error.
 */
export type AdminDonorStatus = 'active' | 'suspended' | 'incomplete';

/** Query params for GET /api/admin/users. All optional. */
export interface AdminDonorFilters {
  /** Free-text search across name, email, and phone. */
  q?: string;
  bloodType?: BloodType;
  city?: string;
  status?: AdminDonorStatus;
  limit?: number;
  offset?: number;
}

/**
 * Correcting a donor's last-donation date. This is the one editable profile
 * field in v1 because it drives the eligibility countdown, and a wrong value
 * either blocks a willing donor or invites one in too early.
 *
 * Send `null` to clear it, which hands eligibility back to the newest
 * `donations` row (see `effectiveLastDonation`).
 */
export interface UpdateDonorBody {
  lastDonationDate: string | null; // ISO
  /** Recorded on the audit row; staff explain a manual correction. */
  reason?: string;
}

/**
 * `suspend` bans the account and revokes its sessions, so it takes effect
 * immediately rather than at token expiry. `delete` is a real cascading delete
 * and cannot be undone — its audit row is written first, with an identifying
 * snapshot, because afterwards there is nothing left to point at.
 */
export type DonorStatusAction = 'suspend' | 'reactivate' | 'delete';

export interface DonorStatusBody {
  action: DonorStatusAction;
  /** Required for `suspend` and `delete`. */
  reason?: string;
}

// --- Phase 3: centers and appointments --------------------------------------

/**
 * A center as staff see it. Centers are public places, so unlike every other
 * admin shape this one does carry exact coordinates — `toCenter` already emits
 * them unrounded to donors for the map.
 */
export type AdminCenter = DonationCenter & {
  /** Appointments still on the books, which is what blocks a delete. */
  upcomingAppointments: number;
};

export interface CreateCenterBody {
  name: string;
  kind: DonationCenter['kind'];
  address: string;
  city: string;
  hours: string;
  rating?: number;
  openNow?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  needsUrgent?: BloodType[] | null;
}

export type UpdateCenterBody = Partial<CreateCenterBody>;

/** An appointment as staff see it: the booking, its center, and its donor. */
export interface AdminAppointment {
  id: string;
  centerId: string;
  centerName: string;
  centerCity: string;
  address: string;
  donorId: string;
  donorName: string;
  donorEmail: string;
  donorPhone?: string;
  donorBloodType?: BloodType;
  /** The donor's own avatar pick; absent until they finish a profile. */
  donorAvatarColor?: string;
  date: string; // ISO
  status: Appointment['status'];
  type: Donation['type'];
}

export interface AdminAppointmentListResponse {
  rows: AdminAppointment[];
  total: number;
}

/** Query params for GET /api/admin/appointments. All optional. */
export interface AdminAppointmentFilters {
  status?: Appointment['status'];
  centerId?: string;
  /** Free text over donor name/email, center name/city, and the booking id. */
  q?: string;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
  limit?: number;
  offset?: number;
}

/**
 * Staff acting on someone else's booking. The end state is identical to the
 * donor-facing routes — both call the same shared transitions — so completing
 * from here records the donation and advances the eligibility countdown exactly
 * as the donor's own tap would.
 */
export type AppointmentAdminAction = 'cancel' | 'complete';

/**
 * Staff booking on a donor's behalf — the phoned-in slot. Same fields as
 * `CreateAppointmentBody` plus the donor it is for, because the caller is not
 * the subject here.
 */
export interface CreateAdminAppointmentBody extends CreateAppointmentBody {
  donorId: string;
}

export interface AppointmentActionBody {
  action: AppointmentAdminAction;
  reason?: string;
}

// --- Phase 4: content and broadcast -----------------------------------------

/** An announcement as staff see it. Same shape donors receive. */
export type AdminAnnouncement = Announcement;

export interface CreateAnnouncementBody {
  title: string;
  body: string;
  /** Short label shown in the home feed's badge, e.g. "Urgent need". */
  tag: string;
  tone: Announcement['tone'];
  /** ISO; defaults to now server-side. */
  date?: string;
}

export type UpdateAnnouncementBody = Partial<CreateAnnouncementBody>;

/** An article as staff see it, body paragraphs included. */
export type AdminArticle = EducationArticle;

/**
 * `body` is a `text[]` of paragraphs, so the editor is a paragraph list rather
 * than a rich-text field — there is no markup pipeline anywhere in the app and
 * `article/[id].tsx` renders each entry as its own `ThemedText` block.
 */
export interface CreateArticleBody {
  title: string;
  summary: string;
  minutes: number;
  category: EducationArticle['category'];
  /** Must be one of `ARTICLE_ICONS`; a non-glyph renders blank in the donor app. */
  icon: string;
  body: string[];
}

export type UpdateArticleBody = Partial<CreateArticleBody>;

/**
 * Who a broadcast reaches. Structured filters only — never an arbitrary
 * recipient list.
 *
 * `intervalElapsed` is **not** named `eligibleOnly`: it measures donation-interval
 * spacing, not medical fitness, and no copy may imply the app judged a donor
 * medically eligible.
 */
export interface BroadcastSegmentBody {
  bloodType?: BloodType;
  city?: string;
  intervalElapsed?: boolean;
}

/** POST /api/admin/broadcast/preview — resolves reach without sending. */
export interface BroadcastPreviewResponse {
  /** Distinct donors matched. This is the number staff confirm. */
  recipientCount: number;
  /** Devices matched; higher when a donor has several registered. */
  deviceCount: number;
  /** True when the segment has no filters and would reach every donor. */
  isEveryone: boolean;
}

export interface BroadcastBody {
  segment: BroadcastSegmentBody;
  title: string;
  body: string;
  /**
   * Required to send to an unfiltered segment. An empty segment reaching every
   * donor must be deliberate, never a forgotten filter.
   */
  confirmAll?: boolean;
}

export interface BroadcastResponse {
  recipientCount: number;
  deviceCount: number;
}
