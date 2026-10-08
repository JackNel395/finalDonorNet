/**
 * Donation-center validation and booking checks, shared by the admin list,
 * create, update, and delete routes.
 *
 * It lives here rather than in one of the route files so a field cannot be
 * validated on create and waved through on edit — the two routes call the same
 * function, and a route importing another route's module would be the only
 * other way to get that.
 *
 * Server-only.
 */
import { and, count, gt, inArray } from 'drizzle-orm';

import { appointments } from '@/db/schema';
import { isValidLat, isValidLng } from '@/lib/geo';
import type { CreateCenterBody } from '@/types/api';
import { BLOOD_TYPES, type BloodType, type DonationCenter } from '@/types/domain';
import { db } from './db';
import { badRequest } from './http';

const KINDS: DonationCenter['kind'][] = ['hospital', 'blood_bank', 'campaign'];

/** Appointment statuses that still occupy a donor's calendar. */
export const ACTIVE_APPOINTMENT_STATUSES = ['confirmed', 'pending'] as const;

const MAX_RATING = 5;

/**
 * Validate a create or update payload.
 *
 * `partial` allows an absent field; a field that is *present* is always checked,
 * so PATCH cannot sneak an empty name or an out-of-range rating past the rules
 * POST enforces.
 */
export function validateCenterFields(body: Partial<CreateCenterBody>, partial: boolean) {
  const text = (value: unknown, field: string): string | undefined => {
    if (value === undefined) {
      if (!partial) throw badRequest(`${field} is required`);
      return undefined;
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw badRequest(`${field} must not be empty`);
    }
    return value.trim();
  };

  const name = text(body.name, 'name');
  const address = text(body.address, 'address');
  const city = text(body.city, 'city');
  const hours = text(body.hours, 'hours');

  let kind: DonationCenter['kind'] | undefined;
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) throw badRequest(`kind must be one of: ${KINDS.join(', ')}`);
    kind = body.kind;
  } else if (!partial) {
    throw badRequest('kind is required');
  }

  let rating: number | undefined;
  if (body.rating !== undefined && body.rating !== null) {
    if (typeof body.rating !== 'number' || !Number.isFinite(body.rating)) {
      throw badRequest('rating must be a number');
    }
    if (body.rating < 0 || body.rating > MAX_RATING) {
      throw badRequest(`rating must be between 0 and ${MAX_RATING}`);
    }
    rating = body.rating;
  }

  if (body.openNow !== undefined && typeof body.openNow !== 'boolean') {
    throw badRequest('openNow must be true or false');
  }

  // Coordinates are all-or-nothing: one half of a pair would silently fall back
  // to the per-city distance while looking like a real location was stored.
  let latitude: number | null | undefined;
  let longitude: number | null | undefined;
  const latGiven = body.latitude !== undefined && body.latitude !== null;
  const lngGiven = body.longitude !== undefined && body.longitude !== null;
  if (latGiven !== lngGiven) {
    throw badRequest('latitude and longitude must be given together, or both left empty');
  }
  if (latGiven && lngGiven) {
    if (!isValidLat(body.latitude)) throw badRequest('latitude must be between -90 and 90');
    if (!isValidLng(body.longitude)) throw badRequest('longitude must be between -180 and 180');
    latitude = body.latitude as number;
    longitude = body.longitude as number;
  } else if (body.latitude === null || body.longitude === null) {
    // An explicit null clears a stored location.
    latitude = null;
    longitude = null;
  }

  let needsUrgent: BloodType[] | null | undefined;
  if (body.needsUrgent !== undefined) {
    if (body.needsUrgent === null) {
      needsUrgent = null;
    } else {
      if (!Array.isArray(body.needsUrgent)) throw badRequest('needsUrgent must be an array');
      for (const t of body.needsUrgent) {
        if (!BLOOD_TYPES.includes(t as BloodType)) {
          throw badRequest(`needsUrgent must contain only blood types: ${BLOOD_TYPES.join(', ')}`);
        }
      }
      // An empty list and "no urgent need" are the same state; store null.
      needsUrgent = body.needsUrgent.length ? (body.needsUrgent as BloodType[]) : null;
    }
  }

  return {
    name,
    kind,
    address,
    city,
    hours,
    rating,
    openNow: body.openNow,
    latitude,
    longitude,
    needsUrgent,
  };
}

/**
 * Counts of still-active future appointments per center — what blocks a delete.
 * A past booking does not: the visit either happened or it didn't, and deleting
 * the center cannot change that for anyone going forward.
 */
export async function countUpcomingByCenter(centerIds: string[]): Promise<Map<string, number>> {
  if (!centerIds.length) return new Map();
  const rows = await db
    .select({ centerId: appointments.centerId, c: count() })
    .from(appointments)
    .where(
      and(
        inArray(appointments.centerId, centerIds),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        gt(appointments.date, new Date()),
      ),
    )
    .groupBy(appointments.centerId);
  return new Map(rows.map((r) => [r.centerId, Number(r.c)]));
}
