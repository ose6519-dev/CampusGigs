import { InputError } from './validation.ts';

export const nigeriaStates = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
  'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
  'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara',
] as const;

export const institutionIdPattern = /^[0-9a-f]{20}$/;
export const publicProviderIdPattern = /^[0-9a-f]{32}$/;

export function parseScope(searchParams: URLSearchParams, allowed: string[]): {
  state: string; institutionId: string; q: string; limit: number;
} {
  for (const key of searchParams.keys()) if (!allowed.includes(key)) throw new InputError('Unknown search filter');
  const read = (key: string, max: number) => {
    const values = searchParams.getAll(key);
    if (values.length > 1 || (values[0] || '').length > max) throw new InputError(`Invalid ${key} filter`);
    return (values[0] || '').trim();
  };
  const state = read('state', 40);
  const institutionId = read('institutionId', 32);
  const q = read('q', 80);
  const rawLimit = read('limit', 2);
  if (state && !nigeriaStates.includes(state as typeof nigeriaStates[number])) throw new InputError('Choose a recognised Nigerian state');
  if (institutionId && !institutionIdPattern.test(institutionId)) throw new InputError('Choose an institution from the directory');
  if (rawLimit && !/^\d{1,2}$/.test(rawLimit)) throw new InputError('Invalid limit');
  const limit = rawLimit ? Number(rawLimit) : 15;
  if (limit < 1 || limit > 24) throw new InputError('Invalid limit');
  return { state, institutionId, q, limit };
}

export function likeTerm(input: string): string {
  return `%${input.replace(/[\\%_]/g, '\\$&')}%`;
}

export async function findInstitution(env: Env, id: string) {
  if (!institutionIdPattern.test(id)) throw new InputError('Select a recognised institution');
  const institution = await env.DB.prepare('SELECT id,name,state_name,institution_type FROM institutions WHERE id=?')
    .bind(id).first<{id:string;name:string;state_name:string;institution_type:string}>();
  if (!institution) throw new InputError('Institution not in our directory');
  return institution;
}

export const onlineExpression = `(CASE WHEN p.show_online=1 AND p.last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes') THEN 1 ELSE 0 END)`;
