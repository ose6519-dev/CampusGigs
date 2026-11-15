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

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

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
