import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseAcademics } from '../src/academicValidation.ts';
import { parseOnboarding } from '../src/onboardingValidation.ts';

test('Phase H accepts paired Nigerian academic details but rejects markup and partial input', () => {
  assert.deepEqual(parseAcademics(' Faculty of Engineering ', ' Electrical and Electronic Engineering '),
    { faculty: 'Faculty of Engineering', department: 'Electrical and Electronic Engineering' });
  assert.deepEqual(parseAcademics('', ''), { faculty: '', department: '' });
  for (const [faculty, department] of [['Engineering',''],['','Computer Science'],['<script>','Biology'],['Engineering','x']]) {
    assert.throws(() => parseAcademics(faculty, department));
  }
  const valid = {userKind:'both',ageRange:'18_24',studentStatus:'student',school:'Niger Delta University',state:'Bayelsa',institutionId:'0123456789abcdef0123',city:'Yenagoa',displayName:'Pere Lsa',interests:['Tech & Digital'],faculty:'Engineering',department:'Electrical and Electronic Engineering'};
  assert.equal(parseOnboarding(valid).department, valid.department);
  assert.throws(() => parseOnboarding({...valid,studentStatus:'non_student'}));
});

test('Phase H academic migration keeps existing profiles and starts optional fields blank', () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql','0004_member_onboarding.sql','0005_campus_social.sql','0008_phase_h_academics.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  }
  db.prepare('INSERT INTO profiles(firebase_uid,email,display_name) VALUES (?,?,?)').run('existing','old@example.com','Existing member');
  assert.deepEqual({...db.prepare('SELECT faculty,department FROM profiles WHERE firebase_uid=?').get('existing')},{faculty:'',department:''});
  db.prepare('UPDATE profiles SET faculty=?,department=? WHERE firebase_uid=?').run('Engineering','Civil Engineering','existing');
  assert.equal(db.prepare('SELECT department FROM profiles WHERE firebase_uid=?').get('existing').department,'Civil Engineering');
  db.close();
});
