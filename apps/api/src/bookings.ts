import type { VerifiedUser } from './auth';
import { InputError } from './validation';
import { bookingUuid, parseBookingDecision, parseBookingRequest, parseBookingRole } from './bookingValidation';

type JsonHandler = (data: unknown, status?: number) => Response;
type BookingContext = { request: Request; url: URL; env: Env; user: VerifiedUser;
  json: JsonHandler; readJson: (request: Request) => Promise<unknown>;
  rateLimit: (env: Env, uid: string, route: string, max: number) => Promise<void> };

type BookingRecord = { id: string; gig_id: string; buyer_uid: string; provider_uid: string;
  service_title: string; service_category: string; price_kobo: number; delivery_days: number;
  brief: string; status: string; requested_at: string; responded_at: string | null; updated_at: string };

const bookable = `g.status='active' AND pp.provider_status='active' AND p.account_status='active'`;

export async function bookings(context: BookingContext): Promise<Response | null> {
  const { request, url, env, user, json } = context;
  const path = url.pathname;

  if (path === '/v1/bookings' && request.method === 'GET') {
    const role = parseBookingRole(url);
    const field = role === 'buyer' ? 'b.buyer_uid' : 'b.provider_uid';
    const query = await env.DB.prepare(`
      SELECT b.id,b.gig_id,b.service_title,b.service_category,b.price_kobo,b.delivery_days,
        b.brief,b.status,b.requested_at,b.responded_at,b.updated_at,
        buyer.display_name AS buyer_name, provider.display_name AS provider_name,
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
    const { buyer_uid: _buyerUid, provider_uid: _providerUid, ...safe } = booking;
    return json({ booking: safe, events: events.results || [], paymentsEnabled: false });
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
      WHERE id=? AND buyer_uid=? AND status IN ('requested','accepted')
    `).bind(user.uid,cancellation[1],user.uid).run();
    return result.meta.changes === 1 ? json({ booking: { id: cancellation[1], status:'cancelled' }, paymentsEnabled: false }) : json({ error: 'This request is already closed or is not yours' }, 409);
  }
  return null;
}

export async function adminBookings(env: Env, json: JsonHandler): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT b.id,b.service_title,b.price_kobo,b.status,b.brief,b.requested_at,b.responded_at,
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
    FROM service_bookings
  `).first();
  return json({ bookings: result.results || [], counts, paymentsEnabled: false });
}
