import type { VerifiedUser } from './auth.ts';
import { InputError } from './validation.ts';
import { bookingUuid, parseBookingDecision, parseBookingProgress, parseBookingRequest, parseBookingReview, parseBookingRole } from './bookingValidation.ts';

type JsonHandler = (data: unknown, status?: number) => Response;
type BookingContext = { request: Request; url: URL; env: Env; user: VerifiedUser;
  json: JsonHandler; readJson: (request: Request) => Promise<unknown>;
  rateLimit: (env: Env, uid: string, route: string, max: number) => Promise<void> };

type BookingRecord = { id: string; gig_id: string; buyer_uid: string; provider_uid: string;
  service_title: string; service_category: string; price_kobo: number; delivery_days: number;
  brief: string; status: string; request_id:string;last_actor_uid:string;
  requested_at: string; responded_at: string | null; updated_at: string };

const bookable = `g.status='active' AND pp.provider_status='active' AND p.account_status='active'
  AND NOT EXISTS(SELECT 1 FROM provider_availability a WHERE a.provider_uid=g.provider_uid AND a.accepting_bookings=0)`;

export async function bookings(context: BookingContext): Promise<Response | null> {
  const { request, url, env, user, json } = context;
  const path = url.pathname;

  if(path==='/v1/provider/availability'&&(request.method==='GET'||request.method==='PUT')){
    const provider=await env.DB.prepare(`SELECT pp.firebase_uid FROM provider_profiles pp
      JOIN profiles p ON p.firebase_uid=pp.firebase_uid
      WHERE pp.firebase_uid=? AND pp.provider_status='active' AND p.account_status='active'`)
      .bind(user.uid).first();
    if(!provider)return json({error:'Only active verified providers can manage availability'},403);
    if(request.method==='PUT'){
      if(!user.emailVerified)return json({error:'Verify your email first'},403);
      await context.rateLimit(env,user.uid,'provider-availability',10);
      const body=await context.readJson(request);
      if(!body||typeof body!=='object'||Array.isArray(body)||
        Object.keys(body).some(key=>key!=='acceptingBookings')||
        typeof (body as {acceptingBookings?:unknown}).acceptingBookings!=='boolean')
        throw new InputError('Choose whether to accept new bookings');
      const accepting=Number((body as {acceptingBookings:boolean}).acceptingBookings);
      await env.DB.prepare(`INSERT INTO provider_availability(provider_uid,accepting_bookings) VALUES (?,?)
        ON CONFLICT(provider_uid) DO UPDATE SET accepting_bookings=excluded.accepting_bookings,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(user.uid,accepting).run();
    }
    const [availability,active]=await Promise.all([
      env.DB.prepare('SELECT accepting_bookings FROM provider_availability WHERE provider_uid=?')
        .bind(user.uid).first<{accepting_bookings:number}>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM service_bookings WHERE provider_uid=? AND status='accepted' AND progress_status!='completed'")
        .bind(user.uid).first<{total:number}>(),
    ]);
    return json({acceptingBookings:(availability?.accepting_bookings??1)===1,activeBookings:active?.total||0});
  }

  if (path === '/v1/bookings' && request.method === 'GET') {
    const role = parseBookingRole(url);
    const field = role === 'buyer' ? 'b.buyer_uid' : 'b.provider_uid';
    const query = await env.DB.prepare(`
      SELECT b.id,b.gig_id,b.service_title,b.service_category,b.price_kobo,b.delivery_days,
        b.brief,b.status,b.progress_status,b.started_at,b.submitted_at,b.completed_at,
        b.requested_at,b.responded_at,b.updated_at,
        buyer.display_name AS buyer_name, provider.display_name AS provider_name,
        EXISTS(SELECT 1 FROM service_reviews r WHERE r.booking_id=b.id) AS reviewed,
        (SELECT id FROM gig_images WHERE gig_id=b.gig_id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM service_bookings b JOIN profiles buyer ON buyer.firebase_uid=b.buyer_uid
      JOIN profiles provider ON provider.firebase_uid=b.provider_uid
      WHERE ${field}=? ORDER BY b.requested_at DESC,b.id DESC LIMIT 100
    `).bind(user.uid).all();
    return json({ bookings: query.results || [], role, paymentsEnabled: false });
  }

  if (path === '/v1/bookings' && request.method === 'POST') {
    if (!user.emailVerified) return json({ error: 'Verify your email before requesting a service' }, 403);
    await context.rateLimit(env, user.uid, 'booking-request', 5);
    await context.rateLimit(env, user.uid, 'booking-request-daily', 20);
    const value = parseBookingRequest(await context.readJson(request));
    const previous = await env.DB.prepare('SELECT id,gig_id,status FROM service_bookings WHERE buyer_uid=? AND request_id=?')
      .bind(user.uid, value.requestId).first<{ id:string; gig_id:string; status:string }>();
    if (previous) return previous.gig_id === value.gigId ? json({ booking: previous, reused: true, paymentsEnabled: false }) : json({ error: 'Request ID already used' }, 409);

    const id = crypto.randomUUID();
    const result = await env.DB.prepare(`
      INSERT OR IGNORE INTO service_bookings
        (id,buyer_uid,provider_uid,gig_id,request_id,service_title,service_category,
          price_kobo,delivery_days,brief,last_actor_uid)
      SELECT ?, ?, g.provider_uid, g.id, ?, g.title, g.category, g.price_kobo, g.delivery_days, ?, ?
      FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
      JOIN profiles p ON p.firebase_uid=g.provider_uid
      WHERE g.id=? AND g.provider_uid<>? AND ${bookable}
    `).bind(id,user.uid,value.requestId,value.brief,user.uid,value.gigId,user.uid).run();
    if (result.meta.changes !== 1) {
      const repeated = await env.DB.prepare('SELECT id,gig_id,status FROM service_bookings WHERE buyer_uid=? AND request_id=?')
        .bind(user.uid,value.requestId).first<{id:string;gig_id:string;status:string}>();
      return repeated?.gig_id === value.gigId ? json({ booking: repeated, reused: true, paymentsEnabled: false }) : json({ error: 'Gig unavailable or request could not be created' }, 409);
    }
    return json({ booking: { id, gig_id: value.gigId, status: 'requested' }, reused: false, paymentsEnabled: false }, 201);
  }

  const detail = path.match(/^\/v1\/bookings\/([0-9a-f-]+)$/i);
  if (detail && request.method === 'GET') {
    if (!bookingUuid(detail[1])) return json({ error: 'Not found' }, 404);
    const booking = await env.DB.prepare('SELECT * FROM service_bookings WHERE id=? AND (buyer_uid=? OR provider_uid=?)')
      .bind(detail[1],user.uid,user.uid).first<BookingRecord>();
    if (!booking) return json({ error: 'Booking not found' }, 404);
    const events = await env.DB.prepare('SELECT from_status,to_status,created_at FROM booking_events WHERE booking_id=? ORDER BY id ASC LIMIT 30')
      .bind(detail[1]).all();
    const review=await env.DB.prepare('SELECT rating,comment,created_at FROM service_reviews WHERE booking_id=?')
      .bind(detail[1]).first();
    const { buyer_uid: _buyerUid, provider_uid: _providerUid,
      request_id: _requestId, last_actor_uid: _lastActor, ...safe } = booking;
    return json({ booking: safe, events: events.results || [], review:review||null,
      viewerRole:user.uid===booking.buyer_uid?'buyer':'provider',paymentsEnabled: false });
  }

  const progress=path.match(/^\/v1\/bookings\/([0-9a-f-]+)\/progress$/i);
  if(progress&&request.method==='POST'){
    if(!bookingUuid(progress[1]))return json({error:'Not found'},404);
    if(!user.emailVerified)return json({error:'Verify your email before updating work'},403);
    await context.rateLimit(env,user.uid,'booking-progress',20);
    const {action,note}=parseBookingProgress(await context.readJson(request));
    const previous=action==='start'?'not_started':action==='submit'?'in_progress':'submitted';
    const next=action==='start'?'in_progress':action==='submit'?'submitted':'completed';
    const owner=action==='confirm'?'buyer_uid':'provider_uid';
    const result=await env.DB.prepare(`UPDATE service_bookings
      SET progress_status=?,last_actor_uid=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        started_at=CASE WHEN ?='start' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE started_at END,
        submitted_at=CASE WHEN ?='submit' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE submitted_at END,
        completion_note=CASE WHEN ?='submit' THEN ? ELSE completion_note END,
        completed_at=CASE WHEN ?='confirm' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE completed_at END
      WHERE id=? AND ${owner}=? AND status='accepted' AND progress_status=?`)
      .bind(next,user.uid,action,action,action,note,action,progress[1],user.uid,previous).run();
    if(result.meta.changes===1)return json({booking:{id:progress[1],progress_status:next},reused:false,paymentsEnabled:false});
    const current=await env.DB.prepare(`SELECT progress_status,status FROM service_bookings WHERE id=? AND ${owner}=?`)
      .bind(progress[1],user.uid).first<{progress_status:string;status:string}>();
    if(!current)return json({error:'Booking not found'},404);
    return current.status==='accepted'&&current.progress_status===next?
      json({booking:{id:progress[1],progress_status:next},reused:true,paymentsEnabled:false}):
      json({error:'Booking is not ready for this step. Refresh and try again.'},409);
  }

  const review=path.match(/^\/v1\/bookings\/([0-9a-f-]+)\/review$/i);
  if(review&&request.method==='POST'){
    if(!bookingUuid(review[1]))return json({error:'Not found'},404);
    if(!user.emailVerified)return json({error:'Verify your email before reviewing'},403);
    await context.rateLimit(env,user.uid,'booking-review',8);
    const {rating,comment}=parseBookingReview(await context.readJson(request));
    const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO service_reviews(booking_id,buyer_uid,provider_uid,rating,comment)
      SELECT b.id,b.buyer_uid,b.provider_uid,?,? FROM service_bookings b
      WHERE b.id=? AND b.buyer_uid=? AND b.status='accepted' AND b.progress_status='completed'`)
      .bind(rating,comment,review[1],user.uid).run();
    if(inserted.meta.changes===1)return json({review:{rating,comment},created:true},201);
    const own=await env.DB.prepare('SELECT progress_status FROM service_bookings WHERE id=? AND buyer_uid=?')
      .bind(review[1],user.uid).first<{progress_status:string}>();
    if(!own)return json({error:'Booking not found'},404);
    return json({error:own.progress_status!=='completed'?'Confirm delivery before reviewing':'This booking has already been reviewed'},409);
  }

  const decision = path.match(/^\/v1\/bookings\/([0-9a-f-]+)\/decision$/i);
  if (decision && request.method === 'POST') {
    if (!bookingUuid(decision[1])) return json({ error: 'Not found' }, 404);
    if (!user.emailVerified) return json({ error: 'Verify your email before responding' }, 403);
    await context.rateLimit(env, user.uid, 'booking-decision', 15);
    const choice = parseBookingDecision(await context.readJson(request));
    const status = choice === 'accept' ? 'accepted' : 'declined';
    const result = await env.DB.prepare(`
      UPDATE service_bookings SET status=?,last_actor_uid=?,responded_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND provider_uid=? AND status='requested'
        AND EXISTS(SELECT 1 FROM provider_profiles pp JOIN profiles p ON p.firebase_uid=pp.firebase_uid
          WHERE pp.firebase_uid=? AND pp.provider_status='active' AND p.account_status='active')
    `).bind(status,user.uid,decision[1],user.uid,user.uid).run();
    return result.meta.changes === 1 ? json({ booking: { id: decision[1], status }, paymentsEnabled: false }) : json({ error: 'This request cannot be changed or is not assigned to you' }, 409);
  }

  const cancellation = path.match(/^\/v1\/bookings\/([0-9a-f-]+)\/cancel$/i);
  if (cancellation && request.method === 'POST') {
    if (!bookingUuid(cancellation[1])) return json({ error: 'Not found' }, 404);
    await context.rateLimit(env, user.uid, 'booking-cancel', 12);
    const result = await env.DB.prepare(`
      UPDATE service_bookings SET status='cancelled',last_actor_uid=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND buyer_uid=? AND status IN ('requested','accepted') AND progress_status IN ('not_started','in_progress')
    `).bind(user.uid,cancellation[1],user.uid).run();
    return result.meta.changes === 1 ? json({ booking: { id: cancellation[1], status:'cancelled' }, paymentsEnabled: false }) : json({ error: 'This request is already closed or is not yours' }, 409);
  }
  return null;
}

export async function adminBookings(env: Env, json: JsonHandler): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT b.id,b.service_title,b.price_kobo,b.status,b.progress_status,b.brief,b.requested_at,b.responded_at,
      buyer.display_name AS buyer_name,buyer.email AS buyer_email,
      provider.display_name AS provider_name
    FROM service_bookings b JOIN profiles buyer ON buyer.firebase_uid=b.buyer_uid
    JOIN profiles provider ON provider.firebase_uid=b.provider_uid
    ORDER BY b.requested_at DESC,b.id DESC LIMIT 100
  `).all();
  const counts = await env.DB.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='requested' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) AS declined,
      SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled
      ,SUM(CASE WHEN progress_status='completed' THEN 1 ELSE 0 END) AS completed
    FROM service_bookings
  `).first();
  return json({ bookings: result.results || [], counts, paymentsEnabled: false });
}
