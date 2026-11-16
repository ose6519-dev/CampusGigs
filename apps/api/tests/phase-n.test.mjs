import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {bookings} from '../src/bookings.ts';
import {parseBookingProgress,parseBookingReview} from '../src/bookingValidation.ts';

const gigId='11223344-1122-4122-8122-112233445566';
const bookingId='33445566-3344-4344-8344-334455667788';
const requestId='22334455-2233-4233-8233-223344556677';

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql','0013_phase_n_booking_progress.sql'])
    db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  for(const uid of ['admin','buyer','provider','stranger'])
    db.prepare('INSERT INTO profiles(firebase_uid,display_name,email) VALUES (?,?,?)').run(uid,uid,`${uid}@test.example`);
  db.prepare(`INSERT INTO provider_applications(id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('app','provider','["Design & Creative"]','NDU','campus','Creative campus branding services','student_id','private/test','approved');
  db.prepare('INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid) VALUES (?,?,?)').run('provider','app','admin');
  db.prepare(`INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(gigId,'provider','Logo design','A complete brand identity for local businesses.','Design & Creative',500000,4,'online','NDU','preview');
  const env={DB:{prepare(sql){const bind=(args)=>({
    all:async()=>({results:db.prepare(sql).all(...args)}),
    first:async()=>db.prepare(sql).get(...args),
    run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),
  });return{bind:(...args)=>bind(args),...bind([])};}}};
  async function send(path,{user='buyer',method='GET',body=null}={}){
    const url=new URL(path,'https://campusgigs-api.test');
    const response=await bookings({request:new Request(url,{method,body:body?JSON.stringify(body):undefined}),url,env,
      user:{uid:user,emailVerified:true,email:`${user}@test.example`},json:(data,status=200)=>Response.json(data,{status}),
      readJson:async()=>body,rateLimit:async()=>{}});
    assert.ok(response,`Unhandled route: ${path}`);
    return {status:response.status,body:await response.json()};
  }
  return {db,send};
}

test('Phase N validates progress notes and customer ratings',()=>{
  assert.deepEqual(parseBookingProgress({action:'start'}),{action:'start',note:''});
  assert.deepEqual(parseBookingProgress({action:'submit',note:'  Logo ready for review.  '}),{action:'submit',note:'Logo ready for review.'});
  for(const value of [{action:'start',note:'x'},{action:'submit',note:'short'},{action:'confirm',role:'admin'},{action:'finish'}])
    assert.throws(()=>parseBookingProgress(value));
  assert.deepEqual(parseBookingReview({rating:5,comment:'  Lovely work.  '}),{rating:5,comment:'Lovely work.'});
  for(const value of [{rating:0},{rating:6},{rating:'5'},{rating:4,comment:'x'.repeat(501)},{rating:3,providerId:'other'}])
    assert.throws(()=>parseBookingReview(value));
});

test('Phase N availability blocks new requests, but resumes safely',async()=>{
  const {db,send}=fixture();
  assert.equal((await send('/v1/provider/availability',{user:'stranger'})).status,403);
  assert.equal((await send('/v1/provider/availability',{user:'provider'})).body.acceptingBookings,true);
  await assert.rejects(()=>send('/v1/provider/availability',{user:'provider',method:'PUT',body:{acceptingBookings:'no'}}));
  assert.equal((await send('/v1/provider/availability',{user:'provider',method:'PUT',body:{acceptingBookings:false}})).body.acceptingBookings,false);
  const request={gigId,requestId,brief:'Please make a clean logo for my food business.'};
  assert.equal((await send('/v1/bookings',{method:'POST',body:request})).status,409);
  await send('/v1/provider/availability',{user:'provider',method:'PUT',body:{acceptingBookings:true}});
  const submitted=await send('/v1/bookings',{method:'POST',body:request});
  assert.equal(submitted.status,201);
  assert.equal((await send('/v1/bookings',{method:'POST',body:request})).body.reused,true);
  db.close();
});

test('Phase N provider submits, buyer confirms and reviews exactly once',async()=>{
  const {db,send}=fixture();
  db.prepare(`INSERT INTO service_bookings(id,buyer_uid,provider_uid,gig_id,request_id,service_title,service_category,price_kobo,delivery_days,brief,last_actor_uid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(bookingId,'buyer','provider',gigId,requestId,'Logo design','Design & Creative',500000,4,'I need a well-designed campus logo.','buyer');
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{user:'stranger',method:'POST',body:{action:'start'}})).status,404);
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{user:'provider',method:'POST',body:{action:'start'}})).status,409,'provider must accept first');
  assert.equal((await send(`/v1/bookings/${bookingId}/decision`,{user:'provider',method:'POST',body:{decision:'accept'}})).status,200);
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{user:'buyer',method:'POST',body:{action:'start'}})).status,404);
  assert.equal((await send(`/v1/bookings/${bookingId}/review`,{user:'buyer',method:'POST',body:{rating:5}})).status,409,'no rating before confirmed delivery');
  const start=await send(`/v1/bookings/${bookingId}/progress`,{user:'provider',method:'POST',body:{action:'start'}});
  assert.equal(start.body.booking.progress_status,'in_progress');
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{user:'provider',method:'POST',body:{action:'start'}})).body.reused,true);
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{user:'buyer',method:'POST',body:{action:'confirm'}})).status,409);
  await assert.rejects(()=>send(`/v1/bookings/${bookingId}/progress`,{user:'provider',method:'POST',body:{action:'submit',note:'short'}}));
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{user:'provider',method:'POST',body:{action:'submit',note:'All brand assets are ready for your review.'}})).body.booking.progress_status,'submitted');
  assert.equal((await send(`/v1/bookings/${bookingId}/cancel`,{method:'POST'})).status,409,'submitted work cannot be silently cancelled');
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{user:'provider',method:'POST',body:{action:'confirm'}})).status,404);
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{method:'POST',body:{action:'confirm'}})).body.booking.progress_status,'completed');
  assert.equal((await send(`/v1/bookings/${bookingId}/progress`,{method:'POST',body:{action:'confirm'}})).body.reused,true);
  assert.equal((await send(`/v1/bookings/${bookingId}/review`,{user:'provider',method:'POST',body:{rating:1}})).status,404);
  assert.equal((await send(`/v1/bookings/${bookingId}/review`,{method:'POST',body:{rating:4,comment:'Delivered on time.'}})).status,201);
  assert.equal((await send(`/v1/bookings/${bookingId}/review`,{method:'POST',body:{rating:1}})).status,409);
  const detail=await send(`/v1/bookings/${bookingId}`);
  assert.equal(detail.body.booking.status,'accepted');
  assert.equal(detail.body.booking.progress_status,'completed');
  assert.equal(detail.body.booking.completion_note,'All brand assets are ready for your review.');
  assert.equal(detail.body.review.rating,4);
  assert.deepEqual(detail.body.events.map(e=>e.to_status),['requested','accepted','in_progress','submitted','completed']);
  assert.equal((await send(`/v1/bookings/${bookingId}`,{user:'stranger'})).status,404);
  assert.equal((await send('/v1/bookings?role=buyer')).body.bookings[0].reviewed,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM service_reviews WHERE provider_uid=?').get('provider').count,1);
  db.close();
});
