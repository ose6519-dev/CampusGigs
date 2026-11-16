import { InputError } from './validation.ts';
import { skillCategories } from './providerValidation.ts';
import { institutionIdPattern, nigeriaStates } from './institutions.ts';

export type PublicGigFilters = {
  q: string;
  category: string;
  location: string;
  state: string;
  institutionId: string;
  locationType: '' | 'online' | 'in_person' | 'both';
  sort: 'newest' | 'price_low' | 'price_high' | 'fastest';
  minPrice: number | null;
  maxPrice: number | null;
  limit: number;
  offset: number;
};

const escaped = (input: string) => input.replace(/[\\%_]/g, '\\$&');
const single = (url: URL, key: string, max: number) => {
  const values = url.searchParams.getAll(key);
  if (values.length > 1 || (values[0] || '').length > max) throw new InputError(`Invalid ${key} filter`);
  return (values[0] || '').trim();
};

function integerInRange(input: string, key: string, max: number): number | null {
  if (!input) return null;
  if (!/^\d{1,10}$/.test(input)) throw new InputError(`Invalid ${key} filter`);
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value > max) throw new InputError(`Invalid ${key} filter`);
  return value;
}

export function parsePublicGigFilters(url: URL): PublicGigFilters {
  for (const key of url.searchParams.keys()) {
    if (!['q', 'category', 'location', 'state', 'institutionId', 'locationType', 'sort', 'minPrice', 'maxPrice', 'limit', 'offset'].includes(key)) {
      throw new InputError('Unknown gig filter');
    }
  }
  const q = single(url, 'q', 80);
  const category = single(url, 'category', 60);
  const location = single(url, 'location', 100);
  const state = single(url, 'state', 40);
  const institutionId = single(url, 'institutionId', 32);
  if (state && !nigeriaStates.includes(state as typeof nigeriaStates[number])) throw new InputError('Choose a recognised state');
  if (institutionId && !institutionIdPattern.test(institutionId)) throw new InputError('Choose a recognised campus');
  const locationType = single(url, 'locationType', 16);
  const sort = single(url, 'sort', 12) || 'newest';
  if (category && !skillCategories.includes(category as typeof skillCategories[number])) throw new InputError('Invalid category filter');
  if (locationType && !['online', 'in_person', 'both'].includes(locationType)) throw new InputError('Invalid location type');
  if (!['newest', 'price_low', 'price_high', 'fastest'].includes(sort)) throw new InputError('Invalid sort order');
  const minPrice = integerInRange(single(url, 'minPrice', 10), 'minPrice', 10_000_000);
  const maxPrice = integerInRange(single(url, 'maxPrice', 10), 'maxPrice', 10_000_000);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw new InputError('Minimum price must not exceed maximum price');
  const limit = integerInRange(single(url, 'limit', 2), 'limit', 24) ?? 12;
  const offset = integerInRange(single(url, 'offset', 7), 'offset', 1_000_000) ?? 0;
  if (limit < 1) throw new InputError('Invalid limit filter');
  return { q, category, location, state, institutionId, locationType: locationType as PublicGigFilters['locationType'],
    sort: sort as PublicGigFilters['sort'], minPrice, maxPrice, limit, offset };
}

export const publicGigWhere = `g.status = 'active' AND pp.provider_status = 'active' AND p.account_status = 'active'`;

export function publicGigQuery(filters: PublicGigFilters): { sql: string; params: Array<string | number> } {
  const where = [publicGigWhere];
  const params: Array<string | number> = [];
  if (filters.q) {
    const pattern = `%${escaped(filters.q)}%`;
    where.push(`(g.title LIKE ? ESCAPE '\\' OR g.description LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\')`);
    params.push(pattern, pattern, pattern);
  }
  if (filters.category) { where.push('g.category = ?'); params.push(filters.category); }
  if (filters.state) { where.push('g.state_name = ?'); params.push(filters.state); }
  if (filters.institutionId) { where.push('g.institution_id = ?'); params.push(filters.institutionId); }
  if (filters.location) {
    const pattern = `%${escaped(filters.location)}%`;
    where.push(`(g.location_name LIKE ? ESCAPE '\\' OR p.campus LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\')`);
    params.push(pattern, pattern, pattern);
  }
  if (filters.locationType) {
    if (filters.locationType === 'both') where.push(`g.location_type = 'both'`);
    else { where.push('(g.location_type = ? OR g.location_type = \'both\')'); params.push(filters.locationType); }
  }
  if (filters.minPrice !== null) { where.push('g.price_kobo >= ?'); params.push(filters.minPrice * 100); }
  if (filters.maxPrice !== null) { where.push('g.price_kobo <= ?'); params.push(filters.maxPrice * 100); }
  const orders: Record<PublicGigFilters['sort'], string> = {
    newest: 'g.created_at DESC, g.id DESC',
    price_low: 'g.price_kobo ASC, g.id DESC',
    price_high: 'g.price_kobo DESC, g.id DESC',
    fastest: 'g.delivery_days ASC, g.id DESC',
  };
  return { sql: `WHERE ${where.join(' AND ')} ORDER BY ${orders[filters.sort]} LIMIT ? OFFSET ?`,
    params: [...params, filters.limit + 1, filters.offset] };
}
