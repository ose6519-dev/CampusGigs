export class AdminAccessError extends Error {
  constructor(message = 'This workspace is available to verified CampusGigs administrators only.') {
    super(message);
  }
}

export function assertAdminAccess(role: string | null | undefined, emailVerified: boolean, accountStatus: string | null | undefined): void {
  if (role !== 'admin' || !emailVerified || accountStatus !== 'active') throw new AdminAccessError();
}

export function parseMemberSearch(url: URL): { search: string; offset: number; limit: number } {
  const search = (url.searchParams.get('search') || '').trim();
  if (search.length > 80) throw new Error('Search must be 80 characters or fewer');
  const rawOffset = url.searchParams.get('offset') || '0';
  if (!/^\d{1,5}$/.test(rawOffset)) throw new Error('Invalid page offset');
  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(offset) || offset > 20000) throw new Error('Invalid page offset');
  return { search, offset, limit: 25 };
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
