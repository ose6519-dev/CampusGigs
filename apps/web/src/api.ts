import type { User } from 'firebase/auth';

export type Profile = {
  firebase_uid: string;
  cg_username: string;
  email: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  campus: string;
  city: string;
  faculty: string;
  department: string;
  directory_preference: 'default' | 'public' | 'private';
  member_public_id: string | null;
  state_name: string;
  institution_id: string | null;
  show_online: 0 | 1;
  active_mode: 'buying' | 'providing';
  onboarding_completed: 0 | 1;
  user_kind: 'buyer' | 'provider' | 'both';
  age_range: '' | 'under_18' | '18_24' | '25_34' | '35_44' | '45_plus';
  student_status: '' | 'student' | 'non_student';
  interests_json: string;
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
  provider_name: string; provider_username?:string; provider_campus?: string; verified_at: string; provider_public_id?: string; provider_online?: 0 | 1;
  state_name: string; institution_id: string | null;
};
export type PublicGigPage = { gigs: PublicGig[]; nextOffset: number | null; paymentsEnabled: false };
export type PublicGigDetail = { gig: PublicGig & {
  provider_avatar: string; provider_bio: string; provider_city: string; provider_campus: string;
}; images: string[]; related: PublicGig[]; paymentsEnabled: false };
export type Institution = {id:string;name:string;state_name:string;institution_type:'university'|'polytechnic'|'college';aliases:string};
export type PublicProvider = {public_id:string;display_name:string;cg_username:string;avatar_url:string;bio:string;campus:string;city:string;
  state_name:string;institution_id:string|null;verified_at:string;online:0|1;follower_count:number;gig_count?:number};
export type PublicProviderPage = {providers:PublicProvider[]};
export type PublicProviderDetail = {provider:PublicProvider;gigs:PublicGig[]};
export type PublicPerson = PublicProvider & { kind:'member'|'provider' };
export type PublicPeoplePage = {people:PublicPerson[]};
export type PublicPersonDetail = {person:PublicPerson;gigs:PublicGig[]};
export type CommunityFollowingResponse = {following:(Pick<PublicPerson,'public_id'|'display_name'|'avatar_url'|'campus'|'state_name'|'online'|'kind'>)[]};
export type FollowingResponse = {following:Pick<PublicProvider,'public_id'|'display_name'|'avatar_url'|'campus'|'state_name'|'online'>[]};
export type InboxNotification = {id:string;kind:'follow'|'booking_requested'|'booking_accepted'|'booking_declined'|'booking_cancelled'|'provider_review';title:string;body:string;target_path:string;is_read:0|1;created_at:string;archived_at:string|null};
export type NotificationInbox = {notifications:InboxNotification[];unreadCount:number;archivedCount:number};
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
