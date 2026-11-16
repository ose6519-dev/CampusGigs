import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {parseOnboarding} from '../src/onboardingValidation.ts';

const valid={userKind:'both',ageRange:'18_24',studentStatus:'student',school:'Niger Delta University',state:'Bayelsa',institutionId:'0123456789abcdef0123',city:'Yenagoa',displayName:'Pere Lsa',interests:['Tech & Digital','Design & Creative']};

test('New member onboarding rejects admin fields, invalid age, unsupported categories and incomplete school',()=>{
  assert.deepEqual(parseOnboarding(valid).interests,valid.interests);
  for(const data of [
    {...valid,onboarding_completed:1},{...valid,userKind:'admin'},{...valid,ageRange:'12'},
    {...valid,studentStatus:'student',school:''},{...valid,institutionId:''},{...valid,state:'Unknown'},{...valid,interests:[]},
    {...valid,interests:['Tech & Digital','Tech & Digital']},
    {...valid,interests:['Hack accounts']},{...valid,city:' '},
    {...valid,displayName:'P'},
  ])assert.throws(()=>parseOnboarding(data));
});

test('Existing Phase A-D profiles remain onboarded and new accounts must complete setup',()=>{
  const db=new DatabaseSync(':memory:');
  for(const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql'])db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  db.prepare('INSERT INTO profiles(firebase_uid,email,display_name) VALUES (?,?,?)').run('older','old@example.com','Old member');
  db.exec(readFileSync(new URL('../migrations/0004_member_onboarding.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0005_campus_social.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0006_institution_directory.sql',import.meta.url),'utf8'));
  assert.equal(db.prepare('SELECT onboarding_completed FROM profiles WHERE firebase_uid=?').get('older').onboarding_completed,1);
  db.prepare('INSERT INTO profiles(firebase_uid,email,display_name) VALUES (?,?,?)').run('new','new@example.com','New member');
  assert.equal(db.prepare('SELECT onboarding_completed FROM profiles WHERE firebase_uid=?').get('new').onboarding_completed,0);
  const p=parseOnboarding(valid);
  const institution=db.prepare("SELECT id,name FROM institutions WHERE state_name='Bayelsa' AND aliases LIKE '%Niger Delta University%' LIMIT 1").get();
  assert.ok(institution);
  db.prepare(`UPDATE profiles SET onboarding_completed=1,user_kind=?,age_range=?,student_status=?,interests_json=?,campus=?,city=?,state_name=?,institution_id=?,active_mode=? WHERE firebase_uid=?`)
    .run(p.userKind,p.ageRange,p.studentStatus,JSON.stringify(p.interests),institution.name,p.city,p.state,institution.id,p.userKind==='provider'?'providing':'buying','new');
  const row=db.prepare('SELECT user_kind,age_range,campus,interests_json,onboarding_completed FROM profiles WHERE firebase_uid=?').get('new');
  assert.deepEqual({...row},{user_kind:'both',age_range:'18_24',campus:institution.name,interests_json:'["Tech & Digital","Design & Creative"]',onboarding_completed:1});
  db.close();
});
