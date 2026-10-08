import { BloodType, Donation, UserProfile } from '@/types/domain';

/** Who a donor of type X can give red cells to (recipient types). */
const DONOR_TO_RECIPIENTS: Record<BloodType, BloodType[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

/** Can a donor with `donor` blood type give to a recipient needing `recipient`? */
export function canDonateTo(donor: BloodType, recipient: BloodType): boolean {
  return DONOR_TO_RECIPIENTS[donor].includes(recipient);
}

/** Recipient types a given donor type can serve. */
export function recipientsFor(donor: BloodType): BloodType[] {
  return DONOR_TO_RECIPIENTS[donor];
}

/** Donor types that can serve a given recipient (compatible donors). */
export function donorsFor(recipient: BloodType): BloodType[] {
  return (Object.keys(DONOR_TO_RECIPIENTS) as BloodType[]).filter((d) =>
    canDonateTo(d, recipient),
  );
}

export const UNIVERSAL_DONOR: BloodType = 'O-';
export const UNIVERSAL_RECIPIENT: BloodType = 'AB+';

/**
 * Minimum interval between whole-blood donations, **Philippine criteria**: the
 * Philippine Red Cross defers whole-blood donors for 3 months, unlike the 56-day
 * (8-week) interval used by the US Red Cross and much of the sample code online.
 *
 * The jurisdiction is in the name on purpose. Erring short is the expensive
 * mistake here — a donor who acts on an early "you're eligible" prompt travels
 * to a center and gets turned away at screening, which costs them a trip and
 * costs us their trust. Erring long only delays a donation by a few weeks.
 *
 * Serving donors outside PH means making this a function of the donor's
 * jurisdiction rather than widening this constant.
 */
export const PH_DONATION_INTERVAL_DAYS = 90;

/** Minimum donor age; 16–17 year-olds need documented parental consent. */
export const PH_MIN_DONOR_AGE = 16;
/** Upper age limit for first-time donors under PRC criteria. */
export const PH_MAX_DONOR_AGE = 65;
/** Minimum donor weight in kilograms. */
export const PH_MIN_DONOR_WEIGHT_KG = 50;

export interface Eligibility {
  eligible: boolean;
  daysRemaining: number;
  nextEligibleDate: Date;
  progress: number; // 0..1 toward next eligible date
}

export function computeEligibility(lastDonationISO?: string, now = new Date()): Eligibility {
  if (!lastDonationISO) {
    return { eligible: true, daysRemaining: 0, nextEligibleDate: now, progress: 1 };
  }
  const last = new Date(lastDonationISO);
  const next = new Date(last);
  next.setDate(next.getDate() + PH_DONATION_INTERVAL_DAYS);
  const msDay = 86_400_000;
  const daysRemaining = Math.max(0, Math.ceil((next.getTime() - now.getTime()) / msDay));
  const elapsed = Math.min(PH_DONATION_INTERVAL_DAYS, (now.getTime() - last.getTime()) / msDay);
  return {
    eligible: daysRemaining <= 0,
    daysRemaining,
    nextEligibleDate: next,
    progress: Math.max(0, Math.min(1, elapsed / PH_DONATION_INTERVAL_DAYS)),
  };
}

/**
 * The donor's most recent donation date for eligibility purposes: the profile's
 * `lastDonationDate` if set, otherwise the newest `donations` row. Shared by
 * Home, Donor, and the respond flow so they compute the same cooldown.
 */
export function effectiveLastDonation(
  profile?: Pick<UserProfile, 'lastDonationDate'>,
  donations?: Pick<Donation, 'date'>[],
): string | undefined {
  return profile?.lastDonationDate ?? donations?.[0]?.date;
}

/**
 * Blood type spoken the way a screen reader should read it. `O-` announced
 * literally becomes "O hyphen" or "O" depending on the engine, which is the
 * one place in this app where a misread is clinically misleading.
 */
export function spokenBloodType(type: BloodType): string {
  const group = type.slice(0, -1);
  return `${group} ${type.endsWith('+') ? 'positive' : 'negative'}`;
}
