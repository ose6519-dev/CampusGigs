import type { User } from 'firebase/auth';

export type Member = {
  firebase_uid: string;
  display_name: string;
  email: string;
  campus: string;
  city: string;
  active_mode: 'buying' | 'providing';
  account_status: 'active' | 'suspended';
  created_at: string;
};

export type Overview = {
  totals: { members: number; buying: number; providing: number; suspended: number; new_week: number };
  providers: { applicants: number; pending: number; approved: number };
  gigCounts: { total: number; active: number };
  recent: Member[];
  phase: string;
  dataSource: string;
};

export type Members = { members: Member[]; nextOffset: number | null };
export type ProviderApplication = {
  id: string; firebase_uid: string; display_name: string; email: string;
  categories: string[]; location_name: string; location_kind: string; bio: string;
  evidence_type: string; status: string; revision: number; review_note: string; submitted_at: string;
};
export type Gig = {
  id: string; provider_name: string; provider_email: string; title: string; description: string; category: string;
  price_kobo: number; delivery_days: number; location_type: string; location_name: string;
  payment_option: string; status: string; moderation_note: string; image_count: number; created_at: string;
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export async function adminGet<T>(user: User, path: string): Promise<T> {
  return adminRequest<T>(user, path);
}

export async function adminRequest<T>(user: User, path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error('CampusGigs API is not configured.');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    cache: 'no-store',
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) {
    const error = new Error(body.error || 'Unable to load this workspace.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function adminEvidenceUrl(user: User, applicationId: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/v1/admin/providers/${applicationId}/evidence`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to load private ID image.');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Invalid ID image format');
  return URL.createObjectURL(blob);
}
