import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { phaseB } from '../src/phaseB.ts';
import { parseScope } from '../src/institutions.ts';
import { notifications } from '../src/notifications.ts';
import { skillCategories } from '../src/providerValidation.ts';
import { serviceSearchWords } from '../src/publicGigs.ts';

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql','0004_member_onboarding.sql','0005_campus_social.sql','0006_institution_directory.sql','0007_phase_g_notifications.sql','0010_phase_j_search.sql','0012_phase_m_notifications.sql','0013_phase_n_booking_progress.sql','0018_phase_s_gig_social.sql'])
    db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const bayelsa=db.prepare("SELECT id,name FROM institutions WHERE state_name='Bayelsa' AND aliases LIKE '%NDU%' LIMIT 1").get();
  const lagos=db.prepare("SELECT id,name FROM institutions WHERE state_name='Lagos' AND aliases LIKE '%UNILAG%' LIMIT 1").get();
  assert.ok(bayelsa,'NDU missing');assert.ok(lagos,'UNILAG missing');
  db.prepare('INSERT INTO profiles(firebase_uid,display_name) VALUES (?,?)').run('buyer','Test buyer');
  for(const [uid,state,school] of [['bay','Bayelsa',bayelsa],['lag','Lagos',lagos]]){
    db.prepare('INSERT INTO profiles(firebase_uid,display_name,city,campus,state_name,institution_id) VALUES (?,?,?,?,?,?)')
      .run(uid,uid==='bay'?'Bayelsa Designer':'Lagos Designer',uid==='bay'?'Yenagoa':'Akoka',school.name,state,school.id);
    db.prepare('INSERT INTO provider_applications(id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(`app-${uid}`,uid,'["Design & Creative"]',school.name,'campus','Quality creative studio services for students','student_id',`private/${uid}`,'approved');
    db.prepare('INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid,public_id) VALUES (?,?,?,lower(hex(randomblob(16))))').run(uid,`app-${uid}`,'buyer');
    db.prepare('INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option,state_name,institution_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(`gig-${uid}`,uid,`Logo design ${uid}`,'Professional logos and creative editing services','Design & Creative',500000,3,'online',uid==='bay'?'Yenagoa':'Akoka','preview',state,school.id);
  }
  const env={DB:{prepare(sql){
    const make=(values)=>({
      all:async()=>({results:db.prepare(sql).all(...values)}),
      first:async()=>db.prepare(sql).get(...values),
      run:async()=>({meta:{changes:Number(db.prepare(sql).run(...values).changes)}}),
    });
    return {bind:(...values)=>make(values),...make([])};
  }}};
  async function request(path,{method='GET',user=null,body=null}={}){
    const url=new URL(path,'https://api.example');
    const context={request:new Request(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined}),url,env,
      user:user?{uid:user,emailVerified:true,email:'test@example.com'}:null,isAdmin:false,
      json:(data,status=200)=>Response.json(data,{status}),readJson:async()=>body,rateLimit:async()=>{}};
    const response=await phaseB(context) || (context.user && await notifications({...context,user:context.user}));
    assert.ok(response,`Unhandled route ${path}`);
    return {status:response.status,body:await response.json()};
  }
  return {db,request,bayelsa,lagos};
}

test('Phase F directory recognises official school names, aliases and rejects invalid scope',async()=>{
  const {db,request,bayelsa}=fixture();
  const matches=await request('/v1/public/institutions?state=Bayelsa&q=Niger%20Delta');
  assert.equal(matches.status,200);
  assert.ok(matches.body.institutions.some(s=>s.id===bayelsa.id));
  const acronym=await request('/v1/public/institutions?state=Bayelsa&q=NDU');
  assert.ok(acronym.body.institutions.some(s=>s.id===bayelsa.id));
  for(const query of ['state=Atlantis','institutionId=%25%25','limit=99','q=a&q=b'])
    assert.throws(()=>parseScope(new URLSearchParams(query),['state','institutionId','q','limit']));
  db.close();
});

test('Phase F listings stay in selected state and exact campus, with no cross-state matches',async()=>{
  const {db,request,bayelsa,lagos}=fixture();
  const byState=await request('/v1/public/gigs?state=Bayelsa');
  assert.deepEqual(byState.body.gigs.map(g=>g.id),['gig-bay']);
  const bySchool=await request(`/v1/public/gigs?institutionId=${bayelsa.id}&state=Bayelsa`);
  assert.deepEqual(bySchool.body.gigs.map(g=>g.id),['gig-bay']);
  const unmatched=await request(`/v1/public/gigs?institutionId=${lagos.id}&state=Lagos&location=Yenagoa`);
  assert.equal(unmatched.body.gigs.length,0);
  await assert.rejects(()=>request(`/v1/public/gigs?institutionId=${lagos.id}&state=Bayelsa`),/outside the selected state/);
  db.close();
});

test('Phase F public provider cards, opt-in presence and private-id-free follows',async()=>{
  const {db,request}=fixture();
  const directory=await request('/v1/public/providers?state=Bayelsa');
  assert.equal(directory.body.providers.length,1);
  const publicId=directory.body.providers[0].public_id;
  assert.match(publicId,/^[0-9a-f]{32}$/);
  assert.equal(directory.body.providers[0].online,0);
  assert.equal('firebase_uid' in directory.body.providers[0],false);
  assert.equal('email' in directory.body.providers[0],false);
  const profile=await request(`/v1/public/providers/${publicId}`);
  assert.equal(profile.body.gigs.length,1);
  assert.equal('private_uid' in profile.body.provider,false);
  const first=await request(`/v1/me/follows/${publicId}`,{method:'PUT',user:'buyer'});
  assert.equal(first.body.following,true);
  assert.equal(first.body.followerCount,1);
  const second=await request(`/v1/me/follows/${publicId}`,{method:'PUT',user:'buyer'});
  assert.equal(second.body.followerCount,1,'follow requests must be idempotent');
  const following=await request('/v1/me/follows',{user:'buyer'});
  assert.deepEqual(following.body.following.map(p=>p.public_id),[publicId]);
  const visible=await request('/v1/me/presence',{method:'POST',user:'bay',body:{visible:true}});
  assert.equal(visible.body.visible,true);
  assert.equal((await request('/v1/public/providers?state=Bayelsa')).body.providers[0].online,1);
  await request('/v1/me/presence',{method:'POST',user:'bay',body:{visible:false}});
  assert.equal((await request('/v1/public/providers?state=Bayelsa')).body.providers[0].online,0);
  const removed=await request(`/v1/me/follows/${publicId}`,{method:'DELETE',user:'buyer'});
  assert.equal(removed.body.followerCount,0);
  db.close();
});

test('Phase G keeps original categories and accepts familiar Nigerian trades',async()=>{
  for(const category of ['Design & Creative','Barbing & Grooming','Hairdressing & Braiding','Electrical Services','Phone & Gadget Repairs','Plumbing & Water Works','Laundry & Cleaning'])
    assert.ok(skillCategories.includes(category),`Missing ${category}`);
  assert.deepEqual(serviceSearchWords('  phone   repair shop '),['phone','repair','shop']);
  const {db,request}=fixture();
  db.prepare(`INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option,state_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run('barb-bay','bay','Student grooming at your hostel',
      'Clean cuts and tidy grooming available around campus.','Barbing & Grooming',200000,1,'in_person','Amassoma','preview','Bayelsa');
  for(const query of ['barber','barbing','haircut']){
    const result=await request(`/v1/public/gigs?state=Bayelsa&q=${query}`);
    assert.ok(result.body.gigs.some(g=>g.id==='barb-bay'),`Search failed for ${query}`);
  }
  assert.equal((await request('/v1/public/gigs?state=Lagos&q=barber')).body.gigs.length,0);
  const providers=await request('/v1/public/providers?state=Bayelsa&q=Design');
  assert.equal(providers.body.providers.length,1,'People search should match offered skills');
  db.close();
});

test('Phase G gig publishing accepts added trades but rejects a spoofed state or school',async()=>{
  const {db,request,bayelsa,lagos}=fixture();
  const gig={title:'Barbing at your hostel',description:'Neat haircuts and professional grooming around campus.',
    category:'Barbing & Grooming',priceKobo:150000,deliveryDays:1,locationType:'in_person',
    locationName:'Amassoma',paymentOption:'preview',state:'Bayelsa',institutionId:bayelsa.id};
  await assert.rejects(()=>request('/v1/provider/gigs',{method:'POST',user:'bay',body:{...gig,state:'Lagos',institutionId:lagos.id}}),/state must match/);
  await assert.rejects(()=>request('/v1/provider/gigs',{method:'POST',user:'bay',body:{...gig,institutionId:lagos.id}}),/confirmed institution/);
  const published=await request('/v1/provider/gigs',{method:'POST',user:'bay',body:gig});
  assert.equal(published.status,201);
  assert.equal(db.prepare('SELECT category FROM gigs WHERE id=?').get(published.body.id).category,'Barbing & Grooming');
  db.close();
});

test('Phase G inbox isolates users, deduplicates follows and reports booking activity',async()=>{
  const {db,request}=fixture();
  const id=db.prepare(`SELECT public_id FROM provider_profiles WHERE firebase_uid='bay'`).get().public_id;
  await request(`/v1/me/follows/${id}`,{method:'PUT',user:'buyer'});
  await request(`/v1/me/follows/${id}`,{method:'PUT',user:'buyer'});
  const providerInbox=await request('/v1/me/notifications',{user:'bay'});
  assert.equal(providerInbox.body.unreadCount,1);
  assert.equal(providerInbox.body.notifications[0].kind,'follow');
  assert.equal(providerInbox.body.notifications[0].target_path,`/people/${id}`);
  assert.equal((await request('/v1/me/notifications',{user:'lag'})).body.unreadCount,0);
  const notificationId=providerInbox.body.notifications[0].id;
  assert.equal((await request(`/v1/me/notifications/${notificationId}/read`,{method:'POST',user:'lag'})).status,404);
  assert.equal((await request(`/v1/me/notifications/${notificationId}/read`,{method:'POST',user:'bay'})).body.read,true);
  assert.equal((await request('/v1/me/notifications',{user:'bay'})).body.unreadCount,0);
  db.prepare(`INSERT INTO service_bookings(id,buyer_uid,provider_uid,gig_id,request_id,service_title,service_category,price_kobo,delivery_days,brief,last_actor_uid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run('booking1','buyer','bay','gig-bay','req1','Logo design','Design & Creative',500000,3,'I need a reliable student business logo','buyer');
  assert.equal((await request('/v1/me/notifications',{user:'bay'})).body.unreadCount,1);
  db.prepare("UPDATE service_bookings SET status='accepted',last_actor_uid='bay' WHERE id='booking1'").run();
  assert.equal((await request('/v1/me/notifications',{user:'buyer'})).body.notifications[0].kind,'booking_accepted');
  const all=await request('/v1/me/notifications/read-all',{method:'POST',user:'bay'});
  assert.equal(all.body.changed,1);
  db.prepare("UPDATE provider_applications SET status='pending' WHERE id='app-bay'").run();
  db.prepare(`UPDATE provider_applications SET status='changes_requested',reviewed_by_uid='buyer',review_note='Upload a clearer ID photo.' WHERE id='app-bay'`).run();
  assert.equal((await request('/v1/me/notifications',{user:'bay'})).body.notifications[0].kind,'provider_review');
  db.close();
});

test('Phase N provider public profile reports availability and completed-review aggregate only',async()=>{
  const {db,request}=fixture();
  const id=db.prepare("SELECT public_id FROM provider_profiles WHERE firebase_uid='bay'").get().public_id;
  const initial=(await request(`/v1/public/providers/${id}`)).body.provider;
  assert.equal(initial.accepting_bookings,1);
  assert.equal(initial.review_count,0);
  assert.equal(initial.rating_average,null);
  db.prepare('INSERT INTO provider_availability(provider_uid,accepting_bookings) VALUES (?,0)').run('bay');
  assert.equal((await request(`/v1/public/providers/${id}`)).body.provider.accepting_bookings,0);
  db.prepare(`INSERT INTO service_bookings(id,buyer_uid,provider_uid,gig_id,request_id,service_title,service_category,price_kobo,delivery_days,brief,last_actor_uid,status,progress_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('n-review-1','buyer','bay','gig-bay','n-req-1','Logo design','Design & Creative',500000,3,'I need a strong logo for my business.','buyer','accepted','completed');
  db.prepare('INSERT INTO service_reviews(booking_id,buyer_uid,provider_uid,rating,comment) VALUES (?,?,?,?,?)')
    .run('n-review-1','buyer','bay',5,'This was a brilliant job.');
  const rated=(await request(`/v1/public/providers/${id}`)).body.provider;
  assert.equal(rated.review_count,1);
  assert.equal(rated.rating_average,5);
  assert.equal('comment' in rated,false,'public provider profile must not disclose comments');
  db.close();
});

test('Phase M notification filters, private reversible archive and unread totals',async()=>{
  const {db,request}=fixture();
  const publicId=db.prepare("SELECT public_id FROM provider_profiles WHERE firebase_uid='bay'").get().public_id;
  await request(`/v1/me/follows/${publicId}`,{method:'PUT',user:'buyer'});
  const first=await request('/v1/me/notifications',{user:'bay'});
  const id=first.body.notifications[0].id;
  assert.equal(first.body.unreadCount,1);
  assert.equal(first.body.archivedCount,0);
  assert.equal((await request('/v1/me/notifications?filter=unread',{user:'bay'})).body.notifications.length,1);
  assert.equal((await request('/v1/me/notifications?filter=archived',{user:'bay'})).body.notifications.length,0);
  assert.equal((await request('/v1/me/notifications?filter=invalid',{user:'bay'})).status,400);
  assert.equal((await request('/v1/me/notifications?filter=unread&filter=all',{user:'bay'})).status,400);
  assert.equal((await request('/v1/me/notifications?scope=everyone',{user:'bay'})).status,400);
  assert.equal((await request(`/v1/me/notifications/${id}/archive`,{method:'POST',user:'lag'})).status,404);
  assert.equal((await request(`/v1/me/notifications/${id}/restore`,{method:'POST',user:'lag'})).status,404);
  assert.equal((await request(`/v1/me/notifications/${id}/archive`,{method:'POST',user:'bay'})).body.archived,true);
  assert.equal((await request(`/v1/me/notifications/${id}/archive`,{method:'POST',user:'bay'})).status,200,'archive is idempotent');
  const archived=await request('/v1/me/notifications?filter=archived',{user:'bay'});
  assert.equal(archived.body.archivedCount,1);
  assert.equal(archived.body.unreadCount,0,'archived unread must not appear in badge');
  assert.equal(archived.body.notifications[0].id,id);
  assert.equal((await request('/v1/me/notifications',{user:'bay'})).body.notifications.length,0);
  assert.equal((await request(`/v1/me/notifications/${id}/read`,{method:'POST',user:'bay'})).status,409);
  assert.equal((await request('/v1/me/notifications/read-all',{method:'POST',user:'bay'})).body.changed,0);
  assert.equal((await request(`/v1/me/notifications/${id}/restore`,{method:'POST',user:'bay'})).body.archived,false);
  assert.equal((await request(`/v1/me/notifications/${id}/restore`,{method:'POST',user:'bay'})).status,200,'restore is idempotent');
  assert.equal((await request('/v1/me/notifications?filter=unread',{user:'bay'})).body.unreadCount,1);
  await request(`/v1/me/notifications/${id}/archive`,{method:'POST',user:'bay'});
  await request(`/v1/me/follows/${publicId}`,{method:'DELETE',user:'buyer'});
  await request(`/v1/me/follows/${publicId}`,{method:'PUT',user:'buyer'});
  const resurfaced=await request('/v1/me/notifications',{user:'bay'});
  assert.equal(resurfaced.body.notifications.length,1);
  assert.equal(resurfaced.body.notifications[0].id,id,'repeat follow reuses unique event');
  assert.equal(resurfaced.body.archivedCount,0);
  assert.equal(resurfaced.body.unreadCount,1);
  db.close();
});

test('Phase G Worker routes and CORS explicitly allow follow write methods',()=>{
  const code=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
  assert.match(code,/Access-Control-Allow-Methods[^\n]*PUT, DELETE/);
  assert.match(code,/\['GET', 'POST', 'PATCH', 'PUT', 'DELETE'\]/);
});
