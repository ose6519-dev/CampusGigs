// One-time data snapshot generator. Sources: NUC, NBTE and NCCE official registers.
// Run from the repository root: node scripts/generate-institutions.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const sources = {
  university: 'https://enuc.nuc.edu.ng/nus',
  polytechnic: 'https://www.digitalnbte.nbte.gov.ng/Public/Institutions?type=polytechnic',
  college: 'https://www.ncce.gov.ng/AccreditedColleges',
};
const aliasMap = {
  'Niger Delta University': 'NDU', 'University of Lagos': 'UNILAG',
  'Lagos State University': 'LASU', 'University of Ibadan': 'UI',
  'University of Nigeria': 'UNN', 'University of Benin': 'UNIBEN',
  'University of Port Harcourt': 'UNIPORT', 'Ahmadu Bello University': 'ABU',
  'Obafemi Awolowo University': 'OAU', 'University of Uyo': 'UNIUYO',
  'Federal University of Technology, Akure': 'FUTA',
  'Yaba College of Technology': 'YABATECH',
  'Federal Polytechnic Nekede': 'NEKEDE POLY',
  'Federal Polytechnic, Nekede': 'NEKEDE POLY',
};
const decode = (input) => input.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const normalizeState = (input) => {
  const cleaned = decode(input).replace(/\s+State$/i, '').trim();
  const corrections = { 'Anambara':'Anambra', 'Ogu':'Ogun', 'Ibadan':'Oyo', 'Yola':'Adamawa', 'FCT Abuja':'FCT', 'Abuja':'FCT', 'Federal Capital Territory':'FCT' };
  return corrections[cleaned] || cleaned;
};
const rows = [];
const validStates = new Set('Abia|Adamawa|Akwa Ibom|Anambra|Bauchi|Bayelsa|Benue|Borno|Cross River|Delta|Ebonyi|Edo|Ekiti|Enugu|FCT|Gombe|Imo|Jigawa|Kaduna|Kano|Katsina|Kebbi|Kogi|Kwara|Lagos|Nasarawa|Niger|Ogun|Ondo|Osun|Oyo|Plateau|Rivers|Sokoto|Taraba|Yobe|Zamfara'.split('|'));
const add = (type, name, state, source) => {
  name = decode(name); state = normalizeState(state);
  if (!validStates.has(state)) return;
  if (!name || !state || !/^[a-z &'-]{2,40}$/i.test(state)) return;
  if (!/(university|polytechnic|college|technology|education)/i.test(name)) return;
  const key = `${type}:${name.toLowerCase()}:${state.toLowerCase()}`;
  const id = createHash('sha256').update(key).digest('hex').slice(0, 20);
  if (rows.some((row) => row.id === id)) return;
  const comparableName = name.toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ');
  const known = Object.entries(aliasMap).find(([prefix]) => comparableName.startsWith(prefix.toLowerCase()));
  const readableName = name.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ');
  const alias = [readableName !== name ? readableName : '', known?.[0] || '', known?.[1] || ''].filter(Boolean).join(' ');
  rows.push({ id, name, state, type, aliases: alias, source });
};
const get = (url) => execFileSync('curl', ['-L', '-sS', '--max-time', '25', url], { encoding: 'utf8', maxBuffer: 8_000_000 });
const nuc = get(sources.university);
for (const hit of nuc.matchAll(/<tr\s+style="font-size:13px;">\s*<td>\d+<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>[\s\S]*?<\/td>\s*<td>(?:State|Federal|Private)<\/td>\s*<td>([\s\S]*?)<\/td>/gi)) {
  add('university', hit[1], hit[2], sources.university);
}
for (let page = 1; page <= 18; page++) {
  const nbte = get(`${sources.polytechnic}&page=${page}`);
  for (const hit of nbte.matchAll(/<span class="irow__name">([\s\S]*?)<\/span>\s*<span class="irow__meta">([\s\S]*?)<\/span>/gi)) {
    if (!/polytechnic/i.test(hit[2])) continue;
    const location = decode(hit[2]).split('·').at(-1) || '';
    add('polytechnic', hit[1], location, sources.polytechnic);
  }
}
const ncce = get(sources.college);
for (const hit of ncce.matchAll(/<tr class="content">([\s\S]*?)<\/tr>/gi)) {
  const cells = [...hit[1].matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/gi)].map((x) => x[1]);
  if (cells.length < 5) continue;
  const school = cells[1].match(/<a[\s\S]*?>([\s\S]*?)<br/i)?.[1];
  if (!school || !/College of Education/i.test(decode(school))) continue;
  add('college', school, cells[4], sources.college);
}
if (rows.length < 300 || rows.filter((r) => r.type === 'university').length < 250) throw new Error(`Unexpectedly small institution directory: ${rows.length}`);
rows.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = [
  '-- Snapshot of official Nigerian institution directories (generated, not manually verified).',
  '-- Sources: NUC enuc.nuc.edu.ng/nus; NBTE digitalnbte.nbte.gov.ng; NCCE ncce.gov.ng.',
  ...rows.map((r) => `INSERT OR IGNORE INTO institutions (id,name,state_name,institution_type,aliases,source_url) VALUES (${[r.id,r.name,r.state,r.type,r.aliases,r.source].map(quote).join(',')});`),
  '',
].join('\n');
writeFileSync('apps/api/migrations/0006_institution_directory.sql', sql);
console.log(JSON.stringify({ total: rows.length, types: Object.fromEntries(['university','polytechnic','college'].map((t) => [t, rows.filter((r) => r.type === t).length])), states: new Set(rows.map((r) => r.state)).size }));
