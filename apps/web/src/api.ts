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

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const gigImageUrl = (gigId: string, imageId: string) => `${baseUrl}/v1/public/gigs/${gigId}/images/${imageId}`;

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
