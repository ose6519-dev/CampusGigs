import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {searchAccount} from '../src/searchAccount.ts';
import {community} from '../src/community.ts';
import {parsePublicGigFilters,publicGigQuery} from '../src/publicGigs.ts';

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const files=['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql','0004_member_onboarding.sql','0005_campus_social.sql','0006_institution_directory.sql','0007_phase_g_notifications.sql','0008_phase_h_academics.sql','0009_phase_i_member_discovery.sql','0010_phase_j_search.sql'];
  for(const file of files)db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const ndu=db.prepare("SELECT id,name FROM institutions WHERE state_name='Bayelsa' AND aliases LIKE '%NDU%' LIMIT 1").get();
  const unilag=db.prepare("SELECT id,name FROM institutions WHERE state_name='Lagos' AND aliases LIKE '%UNILAG%' LIMIT 1").get();
  db.prepare('INSERT INTO profiles(firebase_uid,display_name,email,state_name,institution_id,campus,onboarding_completed,cg_username) VALUES (?,?,?,?,?,?,1,?)')
    .run('member','Ada Tech','a@test.ng','Bayelsa',ndu.id,ndu.name,'adatech');
  db.prepare('INSERT INTO profiles(firebase_uid,display_name,email,state_name,institution_id,campus,onboarding_completed,cg_username) VALUES (?,?,?,?,?,?,1,?)')
    .run('other','A Doctor','b@test.ng','Bayelsa',ndu.id,ndu.name,'doctor');
  db.prepare("INSERT INTO provider_applications(id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status) VALUES ('app','member','[\"Phone & Gadget Repairs\"]','Yenagoa','city','Fix phones','student_id','evidence','approved')").run();
  db.prepare("INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid,public_id) VALUES ('member','app','other',lower(hex(randomblob(16))))").run();
  const bound=sql=>values=>({all:async()=>({results:db.prepare(sql).all(...values)}),first:async()=>db.prepare(sql).get(...values),run:async()=>db.prepare(sql).run(...values)});
  const env={DB:{prepare(sql){return {bind:(...values)=>bound(sql)(values),...bound(sql)([])}}}};
  async function call(path,{method='GET',user='member',body,handler=searchAccount}={}){
    const url=new URL(path,'https://api.test');const req=new Request(url,{method,body:body===undefined?undefined:JSON.stringify(body),headers:body===undefined?undefined:{'Content-Type':'application/json'}});
    const response=await handler({request:req,url,env,user:user?{uid:user,emailVerified:true}:null,isAdmin:false,
      json:(data,status=200)=>Response.json(data,{status}),readJson:async()=>body,rateLimit:async()=>{}});
    assert.ok(response);return {status:response.status,body:await response.json()};
  }
  return {db,call,ndu,unilag};
}

test('Phase J usernames are unique, normalised, private until profile discoverable, and searchable by @handle',async()=>{
  const {db,call,ndu}=fixture();
  assert.equal((await call('/v1/me/username',{method:'PATCH',body:{username:'@Ada_Expert'}})).body.username,'ada_expert');
  assert.equal((await call('/v1/me/username',{method:'PATCH',user:'other',body:{username:'ADA_EXPERT'}})).status,409);
  for(const bad of ['admin','a','1bad','bad.name','my__name'])await assert.rejects(()=>call('/v1/me/username',{method:'PATCH',body:{username:bad}}),/Use 3/);
  await assert.rejects(()=>call('/v1/me/username',{method:'PATCH',body:{username:'good',firebase_uid:'other'}}),/Enter your/);
  const results=await call(`/v1/public/people?q=%40ada_expert&state=Bayelsa&institutionId=${ndu.id}`,{user:null,handler:community});
  assert.equal(results.body.people[0].cg_username,'ada_expert');
  assert.ok(!('email' in results.body.people[0])&&!('firebase_uid' in results.body.people[0]));
  db.close();
});

test('Phase J saved searches are private, deduplicated, deletable and state validated',async()=>{
  const {db,call,ndu,unilag}=fixture();
  const body={kind:'gigs',query:'Phone Repair',state:'Bayelsa',institutionId:ndu.id,category:'',location:'Yenagoa'};
  assert.equal((await call('/v1/me/search-history',{method:'POST',body})).status,201);
  await call('/v1/me/search-history',{method:'POST',body:{...body,query:'phone repair'}});
  const listing=(await call('/v1/me/search-history')).body.history;
  assert.equal(listing.length,1);
  assert.equal((await call('/v1/me/search-history',{user:'other'})).body.history.length,0);
  await assert.rejects(()=>call('/v1/me/search-history',{method:'POST',body:{...body,institutionId:unilag.id}}),/outside the selected state/);
  await assert.rejects(()=>call('/v1/me/search-history',{method:'POST',body:{...body,kind:'people',location:'Yenagoa'}}),/Invalid people search/);
  assert.equal((await call(`/v1/me/search-history/${listing[0].id}`,{method:'DELETE',user:'other'})).body.removed,true);
  assert.equal((await call('/v1/me/search-history')).body.history.length,1);
  await call(`/v1/me/search-history/${listing[0].id}`,{method:'DELETE'});
  assert.equal((await call('/v1/me/search-history')).body.history.length,0);
  await call('/v1/me/search-history',{method:'POST',body});
  await call('/v1/me/search-history',{method:'POST',body:{kind:'people',query:'Ada',state:'Bayelsa',institutionId:ndu.id}});
  await call('/v1/me/search-history?kind=gigs',{method:'DELETE'});
  assert.deepEqual((await call('/v1/me/search-history')).body.history.map(row=>row.kind),['people']);
  db.close();
});

test('Phase J service ranking prioritises username and exact listing title without bypassing campus filters',()=>{
  const filter=parsePublicGigFilters(new URL('https://api.test/v1/public/gigs?q=%40adatech&state=Bayelsa'));
  const query=publicGigQuery(filter);
  assert.match(query.sql,/p\.cg_username LIKE/);
  assert.match(query.sql,/lower\(p\.cg_username\)=lower\(\?\)/);
  assert.match(query.sql,/g\.state_name = \?/);
  assert.ok(query.params.includes('Bayelsa'));
});
