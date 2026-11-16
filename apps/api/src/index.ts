import { AuthError, verifyFirebaseToken } from './auth';
import { AdminAccessError, assertAdminAccess, escapeLike, parseMemberSearch } from './admin';
import { InputError, parseMode, parseProfileUpdate } from './validation';
import type { ProfileRecord } from './types';
import { phaseB } from './phaseB';
import { bookings, adminBookings } from './bookings';
import { parseOnboarding } from './onboardingValidation';
import { findInstitution, institutionIdPattern, nigeriaStates } from './institutions.ts';
import { notifications } from './notifications.ts';
import { validateSchoolAcademics } from './academicCatalog.ts';
import { community } from './community.ts';
import { searchAccount } from './searchAccount.ts';
import { recommendations } from './recommendations.ts';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

class RateLimitError extends Error {}

function addCors(response: Response, request: Request, allowed: string): Response {
  const origin = request.headers.get('origin');
  if (origin && allowed.split(',').map((entry) => entry.trim()).includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  }
  return response;
}

async function readBody(request: Request): Promise<unknown> {
  const limit = 8192;
  if (Number(request.headers.get('content-length') || 0) > limit) throw new InputError('Request too large');
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
    throw new InputError('Content-Type must be application/json');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Request body required');
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new InputError('Request too large');
    }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  raw += decoder.decode();
  try { return JSON.parse(raw); } catch { throw new InputError('Invalid JSON'); }
}

async function checkWriteRateLimit(env: Env, uid: string, route = 'profile', max = 20): Promise<void> {
  const bucket = Math.floor(Date.now() / (route.endsWith('-daily') ? 86_400_000 : 60_000));
  const key = `${route}:${uid}:${bucket}`;
  await env.DB.prepare(`
    INSERT INTO api_rate_limits (key, bucket, hits) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET hits = hits + 1
  `).bind(key, bucket).run();
  const result = await env.DB.prepare('SELECT hits FROM api_rate_limits WHERE key = ?')
    .bind(key).first<{ hits: number }>();
  if ((result?.hits || 0) > max) throw new RateLimitError('Too many requests. Try again in a minute.');
}

async function ensureProfile(env: Env, uid: string, email: string, displayName: string, picture: string): Promise<ProfileRecord> {
  const safeName = displayName.trim().slice(0, 60) || 'CampusGigs member';
  await env.DB.prepare(`
    INSERT OR IGNORE INTO profiles (firebase_uid, email, display_name, avatar_url, cg_username)
    VALUES (?, ?, ?, ?, ?)
  `).bind(uid, email, safeName, picture.startsWith('https://') ? picture : '', 'cg'+crypto.randomUUID().replaceAll('-','').slice(0,16)).run();

  await env.DB.prepare('UPDATE profiles SET email = ? WHERE firebase_uid = ? AND email != ?')
    .bind(email, uid, email).run();
  const record = await env.DB.prepare('SELECT * FROM profiles WHERE firebase_uid = ?')
    .bind(uid).first<ProfileRecord>();
  if (!record) throw new Error('Unable to initialize profile');
  return record;
}

async function route(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const path = requestUrl.pathname;
  if (path === '/health' && request.method === 'GET') {
    return json({ service: 'campusgigs-api', status: 'ok', phase: 'L', bookingsEnabled: true, paymentsEnabled: false });
  }
  if (!path.startsWith('/v1/')) return json({ error: 'Not found' }, 404);
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);

  if (path.startsWith('/v1/public/')) {
    return await community({ request, url: requestUrl, env, user: null, json, readJson: readBody, rateLimit: checkWriteRateLimit, isAdmin: false })
      || await phaseB({ request, url: requestUrl, env, user: null, json, readJson: readBody, rateLimit: checkWriteRateLimit, isAdmin: false })
      || json({ error: 'Not found' }, 404);
  }

  const user = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);

  if (path.startsWith('/v1/admin/')) {
    // The verified Firebase UID, not a browser flag or email parameter, determines admin access.
    const grant = await env.DB.prepare(`
      SELECT r.role, p.account_status FROM platform_roles AS r
      JOIN profiles AS p ON p.firebase_uid = r.firebase_uid
      WHERE r.firebase_uid = ?
    `).bind(user.uid).first<{ role: string; account_status: string }>();
    assertAdminAccess(grant?.role, user.emailVerified, grant?.account_status);

    const phaseBResponse = await phaseB({ request, url: requestUrl, env, user, json, readJson: readBody, rateLimit: checkWriteRateLimit, isAdmin: true });
    if (phaseBResponse) return phaseBResponse;
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

    if (path === '/v1/admin/bookings') return adminBookings(env, json);

    if (path === '/v1/admin/overview') {
      const totals = await env.DB.prepare(`
        SELECT COUNT(*) AS members,
          COALESCE(SUM(CASE WHEN active_mode = 'providing' THEN 1 ELSE 0 END), 0) AS providing,
          COALESCE(SUM(CASE WHEN active_mode = 'buying' THEN 1 ELSE 0 END), 0) AS buying,
          COALESCE(SUM(CASE WHEN account_status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended,
          COALESCE(SUM(CASE WHEN created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') THEN 1 ELSE 0 END), 0) AS new_week
        FROM profiles
      `).first();
      const recent = await env.DB.prepare(`
        SELECT firebase_uid, display_name, email, campus, city, active_mode, account_status, created_at
        FROM profiles ORDER BY created_at DESC, firebase_uid DESC LIMIT 6
      `).all();
      const providers = await env.DB.prepare(`
        SELECT COUNT(*) AS applicants,
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved
        FROM provider_applications
      `).first();
      const gigCounts = await env.DB.prepare(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active FROM gigs
      `).first();
      const bookingCounts = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='requested' THEN 1 ELSE 0 END) AS pending FROM service_bookings`).first();
      return json({ totals, providers, gigCounts, bookingCounts, recent: recent.results || [], phase: 'G', dataSource: 'CampusGigs D1' });
    }

    if (path === '/v1/admin/members') {
      let search: string, offset: number, limit: number;
      try { ({ search, offset, limit } = parseMemberSearch(requestUrl)); }
      catch { throw new InputError('Invalid member search or page offset'); }
      const pattern = `%${escapeLike(search)}%`;
      const members = await env.DB.prepare(`
        SELECT firebase_uid, display_name, email, campus, city, active_mode, account_status, created_at
        FROM profiles
        WHERE display_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
           OR campus LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\'
           OR firebase_uid LIKE ? ESCAPE '\\'
        ORDER BY created_at DESC, firebase_uid DESC LIMIT ? OFFSET ?
      `).bind(pattern, pattern, pattern, pattern, pattern, limit + 1, offset).all();
      const rows = members.results || [];
      return json({ members: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null });
    }

    return json({ error: 'Not found' }, 404);
  }

  const profile = await ensureProfile(env, user.uid, user.emailVerified ? user.email : '', user.displayName, user.picture);
  if (profile.account_status !== 'active') return json({ error: 'Account suspended' }, 403);
  if (!profile.onboarding_completed && path !== '/v1/me' && path !== '/v1/me/onboarding') {
    return json({ error: 'Complete your CampusGigs welcome setup first' }, 403);
  }

  const searchAccountResponse=await searchAccount({request,url:requestUrl,env,user,json,readJson:readBody,rateLimit:checkWriteRateLimit});
  if(searchAccountResponse)return searchAccountResponse;

  const communityResponse = await community({ request, url: requestUrl, env, user, json, readJson: readBody, rateLimit: checkWriteRateLimit, isAdmin: false });
  if (communityResponse) return communityResponse;

  const phaseBResponse = await phaseB({ request, url: requestUrl, env, user, json, readJson: readBody, rateLimit: checkWriteRateLimit, isAdmin: false });
  if (phaseBResponse) return phaseBResponse;

  const activityResponse = await notifications({request,url:requestUrl,env,user,json,rateLimit:checkWriteRateLimit});
  if(activityResponse)return activityResponse;

  const recommended = await recommendations({request,url:requestUrl,env,user,profile,json});
  if(recommended)return recommended;

  const bookingResponse = await bookings({ request, url: requestUrl, env, user, json, readJson: readBody, rateLimit: checkWriteRateLimit });
  if (bookingResponse) return bookingResponse;

  if (path === '/v1/me' && request.method === 'GET') {
    const role = await env.DB.prepare('SELECT role FROM platform_roles WHERE firebase_uid = ?')
      .bind(user.uid).first<{ role: string }>();
    return json({ profile, role: role?.role || 'member', emailVerified: user.emailVerified });
  }

  if (path === '/v1/me/onboarding' && request.method === 'PATCH') {
    if (!user.emailVerified) return json({ error: 'Verify your email before completing your setup' },403);
    await checkWriteRateLimit(env,user.uid,'onboarding',6);
    const value=parseOnboarding(await readBody(request));
    const institution=value.institutionId?await findInstitution(env,value.institutionId):null;
    if (institution && institution.state_name!==value.state) return json({error:'That school is not in the selected state'},400);
    const academics = validateSchoolAcademics(institution?.id || '', value.faculty, value.department);
    await env.DB.prepare(`
      UPDATE profiles SET onboarding_completed=1,user_kind=?,age_range=?,student_status=?,interests_json=?,
        display_name=?,campus=?,city=?,state_name=?,institution_id=?,faculty=?,department=?,active_mode=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE firebase_uid=? AND account_status='active'
    `).bind(value.userKind,value.ageRange,value.studentStatus,JSON.stringify(value.interests),value.displayName,
      institution?.name||'',value.city,value.state,institution?.id||null,academics.faculty,academics.department,
      value.userKind==='provider'?'providing':'buying',user.uid).run();
    return json({completed:true});
  }

  if (path === '/v1/me/location' && request.method === 'PATCH') {
    if (!user.emailVerified) return json({error:'Verify your email first'},403);
    await checkWriteRateLimit(env,user.uid,'location',6);
    const body=await readBody(request);
    if(!body||typeof body!=='object'||Array.isArray(body)) throw new InputError('Select a location');
    const value=body as Record<string,unknown>;
    if(Object.keys(value).some(k=>!['state','institutionId','faculty','department'].includes(k))) throw new InputError('Unknown location field');
    if(typeof value.state!=='string'||!nigeriaStates.includes(value.state as typeof nigeriaStates[number])) throw new InputError('Choose your state');
    const id=value.institutionId||'';
    if(typeof id!=='string'||(id&&!institutionIdPattern.test(id))) throw new InputError('Select a recognised institution');
    const institution=id?await findInstitution(env,id):null;
    if(institution&&institution.state_name!==value.state) throw new InputError('Institution does not belong to that state');
    const academics=validateSchoolAcademics(institution?.id||'',value.faculty??profile.faculty??'',value.department??profile.department??'',{
      institutionId:profile.institution_id,faculty:profile.faculty,department:profile.department,
    });
    if (!institution && (academics.faculty || academics.department)) throw new InputError('Select your institution before adding academic details');
    await env.DB.prepare(`UPDATE profiles SET state_name=?,institution_id=?,campus=?,faculty=?,department=?,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE firebase_uid=?`)
      .bind(value.state,institution?.id||null,institution?.name||'',academics.faculty,academics.department,user.uid).run();
    return json({saved:true,state:value.state,institution:institution?.name||''});
  }

  if (path === '/v1/me' && request.method === 'PATCH') {
    await checkWriteRateLimit(env, user.uid);
    const changes = parseProfileUpdate(await readBody(request));
    if(changes.campus!==undefined) throw new InputError('Choose your school through the verified campus picker in Profile → Campus & privacy');
    const next = {
      display_name: changes.displayName ?? profile.display_name,
      bio: changes.bio ?? profile.bio,
      campus: profile.campus,
      city: changes.city ?? profile.city,
      avatar_url: changes.avatarUrl ?? profile.avatar_url,
    };
    await env.DB.prepare(`
      UPDATE profiles SET display_name = ?, bio = ?, campus = ?, city = ?, avatar_url = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE firebase_uid = ?
    `).bind(next.display_name, next.bio, next.campus, next.city, next.avatar_url, user.uid).run();
    return json({ profile: { ...profile, ...next } });
  }

  if (path === '/v1/me/mode' && request.method === 'PATCH') {
    await checkWriteRateLimit(env, user.uid);
    const mode = parseMode(await readBody(request));
    // Providing mode is just a UI preference; provider privileges require a separate admin-approved record.
    await env.DB.prepare(`
      UPDATE profiles SET active_mode = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE firebase_uid = ?
    `).bind(mode, user.uid).run();
    return json({ mode });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    const allowed = env.WEB_ORIGINS.split(',').map((entry) => entry.trim());
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return addCors(new Response(null, { status: 204 }), request, env.WEB_ORIGINS);
    try {
      return addCors(await route(request, env), request, env.WEB_ORIGINS);
    } catch (error) {
      const status = error instanceof AuthError ? 401 : error instanceof AdminAccessError ? 403 : error instanceof RateLimitError ? 429 : error instanceof InputError ? 400 : 500;
      if (status === 500) console.error(JSON.stringify({ event: 'request_failed', path: new URL(request.url).pathname }));
      const reason = status === 500 ? 'Service temporarily unavailable' : (error as Error).message;
      return addCors(json({ error: reason }, status), request, env.WEB_ORIGINS);
    }
  },
} satisfies ExportedHandler<Env>;
