/** Core domain types for DonorNet. */

export type BloodType = 'O-' | 'O+' | 'A-' | 'A+' | 'B-' | 'B+' | 'AB-' | 'AB+';

export const BLOOD_TYPES: BloodType[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

export type Urgency = 'critical' | 'urgent' | 'moderate' | 'routine';

/** Canonical urgency ordering for sorting — lower ranks first (most urgent). */
export const URGENCY_RANK: Record<Urgency, number> = {
  critical: 0,
  urgent: 1,
  moderate: 2,
  routine: 3,
};

export type RequestStatus = 'open' | 'partial' | 'fulfilled' | 'expired';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not';

export interface HealthInfo {
  weightKg?: number;
  heightCm?: number;
  chronicConditions?: string[];
  medications?: string[];
  lastMealHoursAgo?: number;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  bloodType: BloodType;
  gender?: Gender;
  dateOfBirth?: string; // ISO
  city: string;
  region?: string;
  avatarColor?: string;
  health?: HealthInfo;
  lastDonationDate?: string; // ISO
  createdAt: string; // ISO
}

export interface Donation {
  id: string;
  date: string; // ISO
  centerName: string;
  city: string;
  units: number;
  type: 'whole' | 'plasma' | 'platelets' | 'power_red';
}

export interface Responder {
  id: string;
  fullName: string;
  bloodType: BloodType;
  city: string;
  distanceKm: number;
  avatarColor?: string;
  respondedAt: string; // ISO
  status: 'offered' | 'confirmed';
}

export interface EmergencyRequest {
  id: string;
  ownerId?: string; // profile id of the requester who posted it; undefined for seeded/others' requests
  patientInitials: string;
  bloodType: BloodType;
  unitsNeeded: number;
  unitsFulfilled: number;
  urgency: Urgency;
  hospital: string;
  city: string;
  distanceKm: number;
  neededBy: string; // ISO
  postedAt: string; // ISO
  contactName: string;
  contactPhone: string;
  note?: string;
  status: RequestStatus;
  respondersCount: number;
  responders?: Responder[];
  latitude?: number; // rounded to ~110 m; present only when the request has coords
  longitude?: number;
}

export interface DonationCenter {
  id: string;
  name: string;
  kind: 'hospital' | 'blood_bank' | 'campaign';
  address: string;
  city: string;
  distanceKm: number;
  openNow: boolean;
  hours: string;
  rating: number;
  needsUrgent?: BloodType[];
  latitude?: number; // exact; centers are public places
  longitude?: number;
}

export interface Appointment {
  id: string;
  centerName: string;
  address: string;
  date: string; // ISO datetime
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled';
  type: Donation['type'];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string; // ionicon/material name
  unlocked: boolean;
  progress?: number; // 0..1 when locked
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  tag: string;
  date: string; // ISO
  tone: 'brand' | 'info' | 'success' | 'warning';
}

export interface EducationArticle {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  category: 'eligibility' | 'process' | 'health' | 'myths';
  icon: string;
  body: string[];
}
