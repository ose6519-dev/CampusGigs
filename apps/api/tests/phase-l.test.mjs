import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { memberInterests, recommendations } from '../src/recommendations.ts';

const ndu='6879021fc76ef50a3d30';
const unilag='2fa2c2a9d90565f4ef37';

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql','0004_member_onboarding.sql','0005_campus_social.sql','0006_institution_directory.sql','0007_phase_g_notifications.sql','0008_phase_h_academics.sql','0009_phase_i_member_discovery.sql','0010_phase_j_search.sql','0011_phase_k_ndu_location.sql'])
    db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  db.prepare(`INSERT INTO profiles(firebase_uid,display_name,state_name,institution_id,interests_json)
    VALUES (?,?,?,?,?)`).run('viewer','Student member','Bayelsa',ndu,'["Barbing & Grooming"]');
  for(const [uid,state,id,category] of [
    ['barber','Bayelsa',ndu,'Barbing & Grooming'],
    ['designer','Bayelsa',ndu,'Design & Creative'],
    ['other','Lagos',unilag,'Barbing & Grooming'],
  ]){
    db.prepare(`INSERT INTO profiles(firebase_uid,display_name,state_name,institution_id) VALUES (?,?,?,?)`).run(uid,uid,state,id);
    db.prepare(`INSERT INTO provider_applications(id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(`application-${uid}`,uid,JSON.stringify([category]),uid,'campus','Trusted campus provider','student_id',`private/${uid}`,'approved');
    db.prepare(`INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid,public_id) VALUES (?,?,?,lower(hex(randomblob(16))))`).run(uid,`application-${uid}`,'viewer');
    db.prepare(`INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option,state_name,institution_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(`gig-${uid}`,uid,category,'Professional local service with clear pricing',category,200000,2,'in_person',uid,'preview',state,id);
  }
  db.prepare('INSERT INTO provider_follows(follower_uid,provider_uid) VALUES (?,?)').run('viewer','designer');
  const env={DB:{prepare(sql){return {bind(...args){return {all:async()=>({results:db.prepare(sql).all(...args)})};}};}}};
  const profile={state_name:'Bayelsa',institution_id:ndu,interests_json:'["Barbing & Grooming"]'};
  async function query(currentProfile=profile,pathname='/v1/me/recommended-gigs'){
    const url=new URL(`https://example.test${pathname}`);
    const response=await recommendations({request:new Request(url),url,env,user:{uid:'viewer',emailVerified:true},profile:currentProfile,
      json:(data,status=200)=>Response.json(data,{status})});
    return response?{status:response.status,body:await response.json()}:null;
  }
  return {db,query,profile};
}

test('Phase L recommendations are explainable and based on validated interests',()=>{
  assert.deepEqual(memberInterests('["Barbing & Grooming","Barbing & Grooming","__fake__"]'),['Barbing & Grooming']);
  assert.deepEqual(memberInterests('{bad json'),[]);
});

test('Phase L ranks member interests ahead of followed providers and never crosses campuses',async()=>{
  const {db,query,profile}=fixture();
  const result=await query();
  assert.equal(result.status,200);
  assert.deepEqual(result.body.gigs.map(g=>g.id),['gig-barber','gig-designer']);
  assert.equal(result.body.gigs[0].interest_match,1);
  assert.equal(result.body.gigs[1].following_match,1);
  assert.equal(result.body.paymentsEnabled,false);
  assert.equal(result.body.reason,'interests');
  assert.deepEqual((await query({...profile,state_name:'',institution_id:null})).body.gigs,[]);
  assert.equal((await query({...profile,interests_json:'not json'})).body.reason,'campus');
  assert.equal(await query(profile,'/v1/me/something-else'),null);
  db.close();
});
