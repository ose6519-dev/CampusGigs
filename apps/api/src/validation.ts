import type { Mode } from './types';

export class InputError extends Error {}

export function parseProfileUpdate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Invalid profile data');
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  const permitted = ['displayName', 'bio', 'campus', 'city', 'avatarUrl'];
  if (keys.length < 1 || keys.some((key) => !permitted.includes(key))) throw new InputError('Unknown profile field');

  const clean = (name: string, max: number, min = 0) => {
    const value = record[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new InputError(`${name} must be text`);
    const text = value.trim();
    if (text.length < min || text.length > max) throw new InputError(`${name} must be ${min}–${max} characters`);
    return text;
  };

  const displayName = clean('displayName', 60, 2);
  const bio = clean('bio', 480);
  const campus = clean('campus', 100);
  const city = clean('city', 100);
  const avatarUrl = clean('avatarUrl', 1024);
  if (avatarUrl && (!avatarUrl.startsWith('https://') || /[\x00-\x1f]/.test(avatarUrl))) {
    throw new InputError('Avatar URL must use HTTPS');
  }
  return { displayName, bio, campus, city, avatarUrl };
}

export function parseMode(body: unknown): Mode {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Invalid mode');
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || (record.mode !== 'buying' && record.mode !== 'providing')) {
    throw new InputError('Mode must be buying or providing');
  }
  return record.mode;
}
