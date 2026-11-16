import type { VerifiedUser } from './auth';
import { InputError } from './validation';
import { parseGig, parseModeration, parseProviderApplication, parseReview } from './providerValidation';

type JsonHandler = (data: unknown, status?: number) => Response;
type Context = {
  request: Request;
  url: URL;
  env: Env;
  user: VerifiedUser | null;
  json: JsonHandler;
  readJson: (request: Request) => Promise<unknown>;
  rateLimit: (env: Env, uid: string, route: string, max: number) => Promise<void>;
  isAdmin: boolean;
};

type Application = {
  id: string; firebase_uid: string; skill_categories: string; location_name: string;
  location_kind: string; bio: string; evidence_type: string; status: string;
  revision: number; review_note: string; submitted_at: string; updated_at: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicGigFields = 'g.id,g.title,g.description,g.category,g.price_kobo,g.delivery_days,g.location_type,g.location_name,g.payment_option,g.status,g.created_at,g.updated_at';

function needsAuth(user: VerifiedUser | null): VerifiedUser {
  if (!user) throw new InputError('Sign in to continue');
  return user;
}

function mustHaveVerifiedEmail(user: VerifiedUser | null): VerifiedUser {
  const identity = needsAuth(user);
  if (!identity.emailVerified) throw new InputError('Verify your email address before applying or publishing');
  return identity;
}

function requireAdmin(context: Context): VerifiedUser {
  if (!context.isAdmin) throw new InputError('Administrator access required');
  return needsAuth(context.user);
}

function serializeApplication(row: Application | null) {
  if (!row) return null;
  const data = row as Application & { display_name?: string; email?: string };
  return {
    id: data.id, firebase_uid: data.firebase_uid, display_name: data.display_name, email: data.email,
    location_name: data.location_name, location_kind: data.location_kind, bio: data.bio,
    evidence_type: data.evidence_type, status: data.status, revision: data.revision,
    review_note: data.review_note, submitted_at: data.submitted_at, updated_at: data.updated_at,
    categories: JSON.parse(data.skill_categories) as string[],
  };
}

function mediaFormat(request: Request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const formats: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!type || !formats[type]) throw new InputError('Use a JPEG, PNG or WebP image');
  return { type, ext: formats[type] };
}

async function readImage(request: Request): Promise<{ bytes: Uint8Array; type: string; ext: string }> {
  const { type, ext } = mediaFormat(request);
  const maxBytes = 4 * 1024 * 1024;
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new InputError('Image must be 4 MB or smaller');
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Choose an image');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new InputError('Image must be 4 MB or smaller'); }
    chunks.push(value);
  }
  if (size < 40) throw new InputError('Image is empty or invalid');
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
  const valid = type === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff :
    type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) :
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!valid) throw new InputError('Image contents do not match its file type');
  return { bytes, type, ext };
}

function imageResponse(object: R2ObjectBody): Response {
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

function resultRows<T>(data: D1Result<T>): T[] { return data.results || []; }

export async function phaseB(context: Context): Promise<Response | null> {
  const { request, url, env, json, user } = context;
  const path = url.pathname;

  // Public listings do not expose private applicant IDs, email addresses or drafts.
  if (path === '/v1/public/gigs' && request.method === 'GET') {
    const data = await env.DB.prepare(`
      SELECT ${publicGigFields}, p.display_name AS provider_name, pp.verified_at,
        (SELECT id FROM gig_images WHERE gig_id = g.id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid = g.provider_uid
      JOIN profiles p ON p.firebase_uid = g.provider_uid
      WHERE g.status = 'active' AND pp.provider_status = 'active' AND p.account_status = 'active'
      ORDER BY g.created_at DESC LIMIT 24
    `).all();
    return json({ gigs: data.results || [], paymentsEnabled: false });
  }

  const publicImage = path.match(/^\/v1\/public\/gigs\/([0-9a-f-]+)\/images\/([0-9a-f-]+)$/i);
  if (publicImage && request.method === 'GET') {
    const [, gigId, imageId] = publicImage;
    if (!uuidPattern.test(gigId) || !uuidPattern.test(imageId)) return json({ error: 'Not found' }, 404);
    const image = await env.DB.prepare(`
      SELECT i.object_key FROM gig_images i JOIN gigs g ON g.id = i.gig_id
      JOIN provider_profiles pp ON pp.firebase_uid = g.provider_uid
      JOIN profiles p ON p.firebase_uid = g.provider_uid
      WHERE i.id = ? AND g.id = ? AND g.status = 'active' AND pp.provider_status = 'active' AND p.account_status = 'active'
    `).bind(imageId, gigId).first<{ object_key: string }>();
    if (!image) return json({ error: 'Not found' }, 404);
    const object = await env.MEDIA.get(image.object_key);
    return object ? imageResponse(object) : json({ error: 'Not found' }, 404);
  }

  if (path === '/v1/provider' && request.method === 'GET') {
    const owner = needsAuth(user);
    const application = await env.DB.prepare('SELECT * FROM provider_applications WHERE firebase_uid = ?')
      .bind(owner.uid).first<Application>();
    const verified = await env.DB.prepare('SELECT verified_at, provider_status FROM provider_profiles WHERE firebase_uid = ?')
      .bind(owner.uid).first();
    return json({ application: serializeApplication(application), verified: Boolean(verified && verified.provider_status === 'active'), provider: verified });
  }

  if (path === '/v1/provider/evidence' && request.method === 'POST') {
    const owner = mustHaveVerifiedEmail(user);
    await context.rateLimit(env, owner.uid, 'evidence', 4);
    await context.rateLimit(env, owner.uid, 'evidence-daily', 12);
    const current = await env.DB.prepare('SELECT status FROM provider_applications WHERE firebase_uid = ?')
      .bind(owner.uid).first<{ status: string }>();
    if (current?.status === 'approved') throw new InputError('Your provider account is already approved');
    const image = await readImage(request);
    const key = `provider-evidence/${owner.uid}/${crypto.randomUUID()}.${image.ext}`;
    await env.MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.type }, customMetadata: { ownerUid: owner.uid, privacy: 'admin-only' } });
    return json({ evidenceKey: key }, 201);
  }

  if (path === '/v1/provider/application' && request.method === 'POST') {
    const owner = mustHaveVerifiedEmail(user);
    await context.rateLimit(env, owner.uid, 'provider-apply', 5);
    const value = parseProviderApplication(await context.readJson(request));
    if (!value.evidenceKey.startsWith(`provider-evidence/${owner.uid}/`)) throw new InputError('Upload your own ID image first');
    const object = await env.MEDIA.head(value.evidenceKey);
    if (!object || object.customMetadata?.ownerUid !== owner.uid) throw new InputError('Uploaded ID image was not found');
    const existing = await env.DB.prepare('SELECT id,status FROM provider_applications WHERE firebase_uid = ?')
      .bind(owner.uid).first<{ id: string; status: string }>();
    if (existing?.status === 'approved' || existing?.status === 'pending') throw new InputError('Your application has already been submitted');
    const fields = [JSON.stringify(value.categories), value.locationName, value.locationKind, value.bio, value.evidenceType, value.evidenceKey];
    if (existing) {
      const updated = await env.DB.prepare(`
        UPDATE provider_applications SET skill_categories=?,location_name=?,location_kind=?,bio=?,evidence_type=?,evidence_key=?,
          status='pending',revision=revision+1,review_note='',reviewed_by_uid=NULL,reviewed_at=NULL,
          submitted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=? AND firebase_uid=? AND status IN ('rejected','changes_requested')
      `).bind(...fields, existing.id, owner.uid).run();
      if (updated.meta.changes !== 1) throw new InputError('Application status changed. Refresh and try again.');
    } else {
      await env.DB.prepare(`
        INSERT INTO provider_applications (id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(crypto.randomUUID(), owner.uid, ...fields).run();
    }
    return json({ message: 'Application received. Admin review is pending.' }, 201);
  }

  if (path === '/v1/provider/gigs' && request.method === 'GET') {
    const owner = needsAuth(user);
    const rows = await env.DB.prepare(`
      SELECT g.*, (SELECT COUNT(*) FROM gig_images WHERE gig_id=g.id) AS image_count,
      (SELECT id FROM gig_images WHERE gig_id=g.id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM gigs g WHERE provider_uid = ? ORDER BY created_at DESC LIMIT 100
    `).bind(owner.uid).all();
    return json({ gigs: rows.results || [] });
  }

  if (path === '/v1/provider/gigs' && request.method === 'POST') {
    const owner = mustHaveVerifiedEmail(user);
    await context.rateLimit(env, owner.uid, 'create-gig', 8);
    const verified = await env.DB.prepare(`
      SELECT pp.firebase_uid FROM provider_profiles pp JOIN profiles p ON p.firebase_uid=pp.firebase_uid
      WHERE pp.firebase_uid=? AND pp.provider_status='active' AND p.account_status='active'
    `).bind(owner.uid).first();
    if (!verified) return json({ error: 'Your provider application must be approved before publishing' }, 403);
    const value = parseGig(await context.readJson(request));
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO gigs (id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(id, owner.uid, value.title, value.description, value.category, value.priceKobo, value.deliveryDays, value.locationType, value.locationName, value.paymentOption).run();
    return json({ id, message: 'Gig published. Bookings and payments are not active yet.' }, 201);
  }

  const imagesMatch = path.match(/^\/v1\/provider\/gigs\/([0-9a-f-]+)\/images$/i);
  if (imagesMatch && request.method === 'POST') {
    const owner = mustHaveVerifiedEmail(user);
    const gigId = imagesMatch[1];
    if (!uuidPattern.test(gigId)) return json({ error: 'Not found' }, 404);
    await context.rateLimit(env, owner.uid, 'gig-image', 10);
    const existing = await env.DB.prepare(`
      SELECT g.id,g.status,(SELECT COUNT(*) FROM gig_images WHERE gig_id=g.id) AS image_count
      FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
      WHERE g.id=? AND g.provider_uid=? AND pp.provider_status='active'
    `).bind(gigId, owner.uid).first<{ id: string; status: string; image_count: number }>();
    if (!existing || existing.status === 'removed') return json({ error: 'Gig not found or not editable' }, 404);
    if (existing.image_count >= 4) throw new InputError('Maximum four images per gig');
    const image = await readImage(request);
    const imageId = crypto.randomUUID();
    const key = `gig-images/${gigId}/${imageId}.${image.ext}`;
    await env.MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
    try {
      const inserted = await env.DB.prepare(`
        INSERT INTO gig_images (id,gig_id,object_key,media_type)
        SELECT ?,g.id,?,? FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
        WHERE g.id=? AND g.provider_uid=? AND g.status!='removed' AND pp.provider_status='active'
          AND (SELECT COUNT(*) FROM gig_images WHERE gig_id=g.id) < 4
      `).bind(imageId, key, image.type, gigId, owner.uid).run();
      if (inserted.meta.changes !== 1) { await env.MEDIA.delete(key); return json({ error: 'Gig unavailable or already has four images' }, 409); }
    } catch (error) { await env.MEDIA.delete(key); throw error; }
    return json({ imageId, url: `/v1/public/gigs/${gigId}/images/${imageId}` }, 201);
  }

  if (path === '/v1/admin/providers' && request.method === 'GET') {
    requireAdmin(context);
    const status = url.searchParams.get('status') || 'pending';
    if (!['all','pending','approved','rejected','changes_requested'].includes(status)) throw new InputError('Invalid status filter');
    const query = `SELECT a.id,a.firebase_uid,a.skill_categories,a.location_name,a.location_kind,a.bio,a.evidence_type,a.status,
      a.revision,a.review_note,a.submitted_at,a.updated_at,p.display_name,p.email
      FROM provider_applications a JOIN profiles p ON p.firebase_uid=a.firebase_uid
      ${status === 'all' ? '' : 'WHERE a.status=?'} ORDER BY a.submitted_at DESC LIMIT 100`;
    const rows = status === 'all' ? await env.DB.prepare(query).all() : await env.DB.prepare(query).bind(status).all();
    return json({ applications: resultRows(rows).map(row => serializeApplication(row as Application)) });
  }

  const evidenceMatch = path.match(/^\/v1\/admin\/providers\/([0-9a-f-]+)\/evidence$/i);
  if (evidenceMatch && request.method === 'GET') {
    requireAdmin(context);
    const id = evidenceMatch[1];
    if (!uuidPattern.test(id)) return json({ error: 'Not found' }, 404);
    const row = await env.DB.prepare('SELECT evidence_key FROM provider_applications WHERE id = ?')
      .bind(id).first<{ evidence_key: string }>();
    if (!row) return json({ error: 'Not found' }, 404);
    const object = await env.MEDIA.get(row.evidence_key);
    return object ? imageResponse(object) : json({ error: 'Image unavailable' }, 404);
  }

  const reviewMatch = path.match(/^\/v1\/admin\/providers\/([0-9a-f-]+)\/review$/i);
  if (reviewMatch && request.method === 'POST') {
    const admin = requireAdmin(context);
    const id = reviewMatch[1];
    if (!uuidPattern.test(id)) return json({ error: 'Not found' }, 404);
    await context.rateLimit(env, admin.uid, 'provider-review', 20);
    const value = parseReview(await context.readJson(request));
    const applicant = await env.DB.prepare('SELECT firebase_uid,status FROM provider_applications WHERE id=?')
      .bind(id).first<{ firebase_uid: string; status: string }>();
    if (!applicant) return json({ error: 'Application not found' }, 404);
    if (applicant.firebase_uid === admin.uid) return json({ error: 'Administrators cannot approve their own applications' }, 403);
    const statements: D1PreparedStatement[] = [env.DB.prepare(`
      UPDATE provider_applications SET status=?,review_note=?,reviewed_by_uid=?,
        reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND status='pending'
    `).bind(value.decision, value.note, admin.uid, id)];
    // One review event per revision, even when a request is retried.
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO provider_review_events (id,application_id,admin_uid,decision,note,revision)
      SELECT ?,a.id,?,?,?,a.revision FROM provider_applications a
      WHERE a.id=? AND a.status=? AND a.reviewed_by_uid=?
    `).bind(crypto.randomUUID(), admin.uid, value.decision, value.note, id, value.decision, admin.uid));
    if (value.decision === 'approved') statements.push(env.DB.prepare(`
      INSERT INTO provider_profiles (firebase_uid,application_id,approved_by_uid)
      SELECT a.firebase_uid,a.id,? FROM provider_applications a
      WHERE a.id=? AND a.status='approved' AND a.reviewed_by_uid=?
      ON CONFLICT(firebase_uid) DO NOTHING
    `).bind(admin.uid, id, admin.uid));
    const results = await env.DB.batch(statements);
    if (results[0].meta.changes !== 1) return json({ error: 'Application was already reviewed. Refresh the list.' }, 409);
    return json({ message: `Application ${value.decision.replace('_',' ')}` });
  }

  if (path === '/v1/admin/gigs' && request.method === 'GET') {
    requireAdmin(context);
    const rows = await env.DB.prepare(`
      SELECT ${publicGigFields}, g.moderation_note, p.display_name AS provider_name, p.email AS provider_email,
        (SELECT COUNT(*) FROM gig_images WHERE gig_id=g.id) AS image_count,
        (SELECT id FROM gig_images WHERE gig_id=g.id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM gigs g JOIN profiles p ON p.firebase_uid=g.provider_uid
      ORDER BY g.created_at DESC LIMIT 100
    `).all();
    return json({ gigs: rows.results || [] });
  }

  const moderateMatch = path.match(/^\/v1\/admin\/gigs\/([0-9a-f-]+)\/moderate$/i);
  if (moderateMatch && request.method === 'POST') {
    const admin = requireAdmin(context);
    const id = moderateMatch[1];
    if (!uuidPattern.test(id)) return json({ error: 'Not found' }, 404);
    await context.rateLimit(env, admin.uid, 'gig-moderate', 20);
    const { decision, note } = parseModeration(await context.readJson(request));
    const status = decision === 'removed' ? 'removed' : 'active';
    const update = await env.DB.prepare(`
      UPDATE gigs SET status=?,moderation_note=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND status!=?
    `).bind(status, note, id, status).run();
    if (update.meta.changes !== 1) return json({ error: 'Gig not found or already in that state' }, 409);
    await env.DB.prepare('INSERT INTO gig_moderation_events (id,gig_id,admin_uid,decision,note) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(), id, admin.uid, decision, note).run();
    return json({ status, message: decision === 'removed' ? 'Gig removed from public listings' : 'Gig restored' });
  }

  return null;
}
