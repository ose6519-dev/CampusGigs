import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { phaseB } from '../src/phaseB.ts';
import { parseScope } from '../src/institutions.ts';

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql','0004_member_onboarding.sql','0005_campus_social.sql','0006_institution_directory.sql'])
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
    const response=await phaseB({request:new Request(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined}),url,env,
      user:user?{uid:user,emailVerified:true,email:'test@example.com'}:null,isAdmin:false,
      json:(data,status=200)=>Response.json(data,{status}),readJson:async()=>body,rateLimit:async()=>{}});
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
