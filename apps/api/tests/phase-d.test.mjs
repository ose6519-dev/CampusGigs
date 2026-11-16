import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseBookingRequest, parseBookingDecision, parseBookingRole } from '../src/bookingValidation.ts';

const gigId = '11223344-1122-4122-8122-112233445566';
const requestId = '22334455-2233-4233-8233-223344556677';
const valid = { gigId, requestId, brief:'I need a clean brand identity for my campus business.' };

test('Phase D booking requests require strict fields and a real brief', () => {
  assert.equal(parseBookingRequest(valid).gigId,gigId);
  for (const bad of [
    {...valid,gigId:'../../admin'}, {...valid,requestId:'fake'}, {...valid,brief:'short'},
    {...valid,buyerUid:'admin'}, {...valid,priceKobo:1}, {...valid,brief:32},
  ]) assert.throws(()=>parseBookingRequest(bad));
  assert.equal(parseBookingDecision({decision:'accept'}),'accept');
  assert.equal(parseBookingDecision({decision:'decline'}),'decline');
  assert.throws(()=>parseBookingDecision({decision:'approve',role:'admin'}));
  assert.throws(()=>parseBookingDecision({decision:'accept',adminOverride:true}));
  assert.equal(parseBookingRole(new URL('https://example.com/v1/bookings?role=provider')),'provider');
  assert.throws(()=>parseBookingRole(new URL('https://example.com/v1/bookings?role=admin')));
});

function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url),'utf8'));
  }
  for (const uid of ['admin','buyer','provider','other']) db.prepare('INSERT INTO profiles(firebase_uid,display_name,email) VALUES (?,?,?)').run(uid,uid,`${uid}@example.com`);
  db.prepare('INSERT INTO provider_applications (id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('app','provider','["Design & Creative"]','NDU','campus','Experienced professional design services','student_id','private/evidence','approved');
  db.prepare('INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid) VALUES (?,?,?)').run('provider','app','admin');
  db.prepare('INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(gigId,'provider','Logo and visual identity','I design logos and brand identity for campus businesses.','Design & Creative',500000,4,'online','NDU','preview');
  return db;
}

test('Phase D booking has snapshots, audit events, role ownership and atomic status guards', () => {
  const db = fixture();
  const id='33445566-3344-4344-8344-334455667788';
  const insert = db.prepare(`INSERT OR IGNORE INTO service_bookings(id,buyer_uid,provider_uid,gig_id,request_id,service_title,service_category,price_kobo,delivery_days,brief,last_actor_uid)
    SELECT ?,?,g.provider_uid,g.id,?,g.title,g.category,g.price_kobo,g.delivery_days,?,?
    FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid JOIN profiles p ON p.firebase_uid=g.provider_uid
    WHERE g.id=? AND g.provider_uid<>? AND g.status='active' AND pp.provider_status='active' AND p.account_status='active'`);
  assert.equal(insert.run(id,'buyer',requestId,valid.brief,'buyer',gigId,'buyer').changes,1);
  assert.equal(insert.run('new-id','buyer',requestId,valid.brief,'buyer',gigId,'buyer').changes,0,'idempotent request must not duplicate');
  const booking=db.prepare('SELECT price_kobo,service_title,status FROM service_bookings WHERE id=?').get(id);
  assert.deepEqual({...booking},{price_kobo:500000,service_title:'Logo and visual identity',status:'requested'});
  db.prepare('UPDATE gigs SET price_kobo=? WHERE id=?').run(900000,gigId);
  assert.equal(db.prepare('SELECT price_kobo FROM service_bookings WHERE id=?').get(id).price_kobo,500000,'bookings must keep original price');
  const update = db.prepare("UPDATE service_bookings SET status='accepted',last_actor_uid=? WHERE id=? AND provider_uid=? AND status='requested'");
  assert.equal(update.run('other',id,'other').changes,0,'other users cannot decide');
  assert.equal(update.run('provider',id,'provider').changes,1);
  assert.equal(update.run('provider',id,'provider').changes,0,'repeated decisions must be denied');
  const events=db.prepare('SELECT actor_uid,from_status,to_status FROM booking_events WHERE booking_id=? ORDER BY id').all(id);
  assert.deepEqual(events.map(event=>({...event})),[
    {actor_uid:'buyer',from_status:null,to_status:'requested'},
    {actor_uid:'provider',from_status:'requested',to_status:'accepted'},
  ]);
  assert.equal(db.prepare("UPDATE service_bookings SET status='cancelled',last_actor_uid=? WHERE id=? AND buyer_uid=? AND status IN ('requested','accepted')").run('buyer',id,'buyer').changes,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM booking_events WHERE booking_id=?').get(id).total,3);
  db.close();
});

test('Phase D does not create bookings for paused or suspended providers or self-booking', () => {
  const db=fixture();
  const insert=db.prepare(`INSERT OR IGNORE INTO service_bookings(id,buyer_uid,provider_uid,gig_id,request_id,service_title,service_category,price_kobo,delivery_days,brief,last_actor_uid)
    SELECT ?,?,g.provider_uid,g.id,?,g.title,g.category,g.price_kobo,g.delivery_days,?,?
    FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid JOIN profiles p ON p.firebase_uid=g.provider_uid
    WHERE g.id=? AND g.provider_uid<>? AND g.status='active' AND pp.provider_status='active' AND p.account_status='active'`);
  const run=(buyer='buyer')=>insert.run(crypto.randomUUID(),buyer,crypto.randomUUID(),valid.brief,buyer,gigId,buyer).changes;
  assert.equal(run('provider'),0);
  db.exec("UPDATE gigs SET status='paused'");
  assert.equal(run(),0);
  db.exec("UPDATE gigs SET status='active'; UPDATE provider_profiles SET provider_status='suspended'");
  assert.equal(run(),0);
  db.close();
});
