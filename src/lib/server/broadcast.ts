/**
 * Broadcast segment and copy validation, shared by the preview and send routes.
 *
 * Both must agree exactly. If the preview accepted a segment the send parsed
 * differently, staff would confirm one recipient count and a different set of
 * donors would be written to — which is the single worst failure this feature
 * could have.
 *
 * Server-only.
 */
import type { BroadcastSegment } from '@/lib/server/push';
import type { BroadcastBody, BroadcastSegmentBody } from '@/types/api';
import { BLOOD_TYPES, type BloodType } from '@/types/domain';
import { badRequest } from './http';

/**
 * Caps sized to what a lock screen actually shows. Longer copy is silently
 * truncated by the OS, so a donor would see a sentence that stops mid-word —
 * better to refuse it and let staff rewrite.
 */
const MAX_TITLE = 65;
const MAX_BODY = 240;

export function validateSegment(raw: BroadcastSegmentBody | undefined): {
  segment: BroadcastSegment;
  isEveryone: boolean;
} {
  const input = raw ?? {};

  let bloodType: BloodType | undefined;
  if (input.bloodType !== undefined && input.bloodType !== null) {
    if (!BLOOD_TYPES.includes(input.bloodType)) {
      throw badRequest(`bloodType must be one of: ${BLOOD_TYPES.join(', ')}`);
    }
    bloodType = input.bloodType;
  }

  let city: string | undefined;
  if (input.city !== undefined && input.city !== null) {
    if (typeof input.city !== 'string') throw badRequest('city must be a string');
    // An all-whitespace city is "no filter", not a filter matching nothing.
    city = input.city.trim() || undefined;
  }

  if (input.intervalElapsed !== undefined && typeof input.intervalElapsed !== 'boolean') {
    throw badRequest('intervalElapsed must be true or false');
  }
  const intervalElapsed = input.intervalElapsed === true;

  const segment: BroadcastSegment = { bloodType, city, intervalElapsed };

  // `intervalElapsed: false` narrows nothing, so it does not count as a filter.
  const isEveryone = !bloodType && !city && !intervalElapsed;

  return { segment, isEveryone };
}

export function validateBroadcastCopy(body: Pick<BroadcastBody, 'title' | 'body'>): {
  title: string;
  text: string;
} {
  if (typeof body.title !== 'string' || !body.title.trim()) {
    throw badRequest('title is required');
  }
  if (typeof body.body !== 'string' || !body.body.trim()) {
    throw badRequest('body is required');
  }
  const title = body.title.trim();
  const text = body.body.trim();

  if (title.length > MAX_TITLE) {
    throw badRequest(`title must be ${MAX_TITLE} characters or fewer so it is not cut off on a lock screen`);
  }
  if (text.length > MAX_BODY) {
    throw badRequest(`body must be ${MAX_BODY} characters or fewer so it is not cut off on a lock screen`);
  }

  return { title, text };
}
