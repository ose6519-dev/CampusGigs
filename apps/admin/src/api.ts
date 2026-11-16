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
  recent: Member[];
  phase: string;
  dataSource: string;
};

export type Members = { members: Member[]; nextOffset: number | null };

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export async function adminGet<T>(user: User, path: string): Promise<T> {
  if (!apiBaseUrl) throw new Error('CampusGigs API is not configured.');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
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
