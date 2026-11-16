import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {community} from '../src/community.ts';

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql','0004_member_onboarding.sql','0005_campus_social.sql','0006_institution_directory.sql','0007_phase_g_notifications.sql','0008_phase_h_academics.sql','0009_phase_i_member_discovery.sql','0010_phase_j_search.sql'])
    db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const bay=db.prepare("SELECT id,name FROM institutions WHERE state_name='Bayelsa' AND aliases LIKE '%NDU%' LIMIT 1").get();
  const lag=db.prepare("SELECT id,name FROM institutions WHERE state_name='Lagos' AND aliases LIKE '%UNILAG%' LIMIT 1").get();
  assert.ok(bay);assert.ok(lag);
  const insert=db.prepare('INSERT INTO profiles(firebase_uid,email,display_name,state_name,institution_id,campus,onboarding_completed) VALUES (?,?,?,?,?,?,1)');
  insert.run('owner','owner@example.com','Campus member','Bayelsa',bay.id,bay.name);
  insert.run('fan','fan@example.com','Follower one','Bayelsa',bay.id,bay.name);
  insert.run('other','other@example.com','Lagos student','Lagos',lag.id,lag.name);
  insert.run('provider','provider@example.com','Approved expert','Bayelsa',bay.id,bay.name);
  db.prepare(`INSERT INTO provider_applications(id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status)
    VALUES ('application','provider','["Design & Creative"]',?,'campus','Test bio','student_id','evidence','approved')`).run(bay.name);
  db.prepare("INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid,public_id) VALUES ('provider','application','owner',lower(hex(randomblob(16))))").run();
  const env={DB:{prepare(sql){const make=(values)=>({all:async()=>({results:db.prepare(sql).all(...values)}),first:async()=>db.prepare(sql).get(...values),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...values).changes)}})});return {bind:(...values)=>make(values),...make([])};}}};
  async function request(path,{method='GET',user=null,body=null}={}){
    const url=new URL(path,'https://api.example');
    const context={request:new Request(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined}),url,env,
      user:user?{uid:user,emailVerified:true,email:`${user}@example.com`}:null,isAdmin:false,
      json:(data,status=200)=>Response.json(data,{status}),readJson:async()=>body,rateLimit:async()=>{}};
    const response=await community(context);assert.ok(response,`Unhandled ${path}`);
    return {status:response.status,body:await response.json()};
  }
  return {db,request,bay,lag};
}

test('Phase I lists approved providers but keeps ordinary members private until explicit opt-in',async()=>{
  const {db,request,bay,lag}=fixture();
  const initial=await request(`/v1/public/people?state=Bayelsa&institutionId=${bay.id}`);
  assert.deepEqual(initial.body.people.map(row=>row.kind),['provider']);
  assert.equal(initial.body.people[0].display_name,'Approved expert');
  const visible=await request('/v1/me/directory',{method:'PATCH',user:'owner',body:{visible:true}});
  assert.equal(visible.body.visible,true);
  const after=await request(`/v1/public/people?state=Bayelsa&institutionId=${bay.id}`);
  assert.deepEqual(new Set(after.body.people.map(row=>row.kind)),new Set(['provider','member']));
  const member=after.body.people.find(row=>row.kind==='member');
  assert.match(member.public_id,/^[0-9a-f]{32}$/);
  assert.ok(!('firebase_uid' in member)&&!('email' in member)&&!('faculty' in member));
  assert.equal((await request(`/v1/public/people?state=Lagos&institutionId=${lag.id}`)).body.people.length,0);
  assert.equal((await request(`/v1/public/people/${member.public_id}`)).body.person.display_name,'Campus member');
  await assert.rejects(()=>request(`/v1/public/people?state=Bayelsa&institutionId=${lag.id}`),/outside the selected state/);
  db.close();
});

test('Phase I member follows are idempotent, private across accounts and generate private notifications',async()=>{
  const {db,request}=fixture();
  assert.equal((await request('/v1/public/people?q=Follower')).body.people.length,0);
  await request('/v1/me/directory',{method:'PATCH',user:'owner',body:{visible:true}});
  const publicId=db.prepare("SELECT member_public_id FROM profiles WHERE firebase_uid='owner'").get().member_public_id;
  const first=await request(`/v1/me/member-follows/${publicId}`,{method:'PUT',user:'fan'});
  assert.deepEqual(first.body,{following:true,followerCount:1});
  assert.equal((await request(`/v1/me/member-follows/${publicId}`,{method:'PUT',user:'fan'})).body.followerCount,1);
  assert.equal((await request('/v1/me/community-follows',{user:'fan'})).body.following[0].public_id,publicId);
  assert.equal((await request('/v1/me/community-follows',{user:'other'})).body.following.length,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_notifications WHERE recipient_uid='owner' AND kind='follow'").get().n,1);
  const hidden=await request('/v1/me/directory',{method:'PATCH',user:'owner',body:{visible:false}});
  assert.equal(hidden.body.visible,false);
  assert.equal((await request(`/v1/public/people/${publicId}`)).status,404);
  assert.equal((await request('/v1/public/people?state=Bayelsa')).body.people.some(row=>row.public_id===publicId),false);
  assert.equal((await request('/v1/me/community-follows',{user:'fan'})).body.following.length,0);
  assert.equal((await request(`/v1/me/member-follows/${publicId}`,{method:'PUT',user:'other'})).status,404);
  await request('/v1/me/directory',{method:'PATCH',user:'owner',body:{visible:true}});
  assert.equal(db.prepare("SELECT member_public_id FROM profiles WHERE firebase_uid='owner'").get().member_public_id,publicId);
  db.close();
});

test('Phase I directory settings reject unsupported or dangerous input and protect self-follow',async()=>{
  const {db,request}=fixture();
  for(const body of [{visible:'yes'},{visible:true,uid:'other'},{visible:1}]){
    await assert.rejects(()=>request('/v1/me/directory',{method:'PATCH',user:'owner',body}),/Choose whether/);
  }
  await request('/v1/me/directory',{method:'PATCH',user:'owner',body:{visible:true}});
  const id=db.prepare("SELECT member_public_id FROM profiles WHERE firebase_uid='owner'").get().member_public_id;
  await assert.rejects(()=>request(`/v1/me/member-follows/${id}`,{method:'PUT',user:'owner'}),/cannot follow yourself/);
  db.close();
});
