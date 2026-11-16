import type { User } from 'firebase/auth';

export type Profile = {
  firebase_uid: string;
  email: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  campus: string;
  city: string;
  active_mode: 'buying' | 'providing';
  account_status: string;
  created_at: string;
};

export type MeResponse = { profile: Profile; role: string; emailVerified: boolean };

export type ProviderApplication = {
  id: string; status: 'pending' | 'approved' | 'rejected' | 'changes_requested'; categories: string[];
  location_name: string; location_kind: 'campus' | 'city'; bio: string;
  evidence_type: 'student_id' | 'government_id'; review_note: string; revision: number; submitted_at: string;
};
export type ProviderStatus = { application: ProviderApplication | null; verified: boolean; provider: { provider_status: string; verified_at: string } | null };
export type Gig = { id: string; title: string; description: string; category: string; price_kobo: number; delivery_days: number;
  location_name: string; location_type: string; payment_option: string; status: string; cover_image_id: string | null; image_count: number; created_at: string };
export type ProviderGigs = { gigs: Gig[] };

export type PublicGig = Pick<Gig, 'id' | 'title' | 'description' | 'category' | 'price_kobo' | 'delivery_days' | 'location_name' | 'location_type' | 'payment_option' | 'cover_image_id' | 'created_at'> & {
  provider_name: string; provider_campus?: string; verified_at: string;
};
export type PublicGigPage = { gigs: PublicGig[]; nextOffset: number | null; paymentsEnabled: false };
export type PublicGigDetail = { gig: PublicGig & {
  provider_avatar: string; provider_bio: string; provider_city: string; provider_campus: string;
}; images: string[]; related: PublicGig[]; paymentsEnabled: false };
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'cancelled';
export type BookingSummary = {
  id: string; gig_id: string; service_title: string; service_category: string;
  price_kobo: number; delivery_days: number; brief: string; status: BookingStatus;
  requested_at: string; responded_at: string | null; updated_at: string;
  buyer_name: string; provider_name: string; cover_image_id: string | null;
};
export type BookingsResponse = { bookings: BookingSummary[]; role: 'buyer' | 'provider'; paymentsEnabled: false };
export type BookingDetail = { booking: BookingSummary; events: { from_status: BookingStatus | null; to_status: BookingStatus; created_at: string }[]; paymentsEnabled: false };

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const gigImageUrl = (gigId: string, imageId: string) => `${baseUrl}/v1/public/gigs/${gigId}/images/${imageId}`;

export async function publicRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!baseUrl) throw new Error('CampusGigs API is not configured');
  const response = await fetch(`${baseUrl}${path}`, { signal, headers: { Accept: 'application/json' } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Could not load gigs. Try again.');
  return data;
}

export async function apiRequest<T>(user: User, path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new Error('CampusGigs API has not been configured');
  const idToken = await user.getIdToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
  return payload;
}
