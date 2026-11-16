import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { publicAcademicCatalog, validateSchoolAcademics } from '../src/academicCatalog.ts';
import { phaseB } from '../src/phaseB.ts';

const ndu='6879021fc76ef50a3d30';
const unilag='2fa2c2a9d90565f4ef37';

test('Phase K matches faculty and department to the selected institution',()=>{
  const catalog=publicAcademicCatalog(ndu);
  assert.equal(catalog.verified,true);
  assert.ok(catalog.sourceUrl.startsWith('https://www.ndu.edu.ng/'));
  assert.ok(catalog.faculties.Engineering.includes('Electrical / Electronic Engineering'));
  assert.deepEqual(validateSchoolAcademics(ndu,' engineering ',' electrical / electronic engineering '),{
    faculty:'Engineering',department:'Electrical / Electronic Engineering',
  });
  assert.throws(()=>validateSchoolAcademics(ndu,'Engineering','Mass Communication'),/verified list/);
  assert.throws(()=>validateSchoolAcademics(unilag,'Social Sciences','Mass Communication'),/verified list/);
  assert.deepEqual(validateSchoolAcademics(unilag,'Communication and Media Studies','Mass Communication'),{
    faculty:'Communication and Media Studies',department:'Mass Communication',
  });
  assert.deepEqual(validateSchoolAcademics(ndu,'Engineering','Electrical Engineering',{
    institutionId:ndu,faculty:'Engineering',department:'Electrical Engineering',
  }),{faculty:'Engineering',department:'Electrical Engineering'},'existing values are preserved until edited');
  assert.throws(()=>validateSchoolAcademics(unilag,'Engineering','Electrical Engineering',{
    institutionId:ndu,faculty:'Engineering',department:'Electrical Engineering',
  }),/verified list/,'legacy details cannot be transferred between campuses');
  assert.equal(publicAcademicCatalog('00000000000000000000').verified,false);
  assert.deepEqual(validateSchoolAcademics('00000000000000000000','School of Business Studies','Accountancy'),{
    faculty:'School of Business Studies',department:'Accountancy',
  });
});

test('Phase K public school search ranks acronym first and preserves state restrictions',async()=>{
  const db=new DatabaseSync(':memory:');
  for(const file of ['0001_profiles.sql','0002_providers_gigs.sql','0003_bookings.sql','0004_member_onboarding.sql','0005_campus_social.sql'])
    db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0006_institution_directory.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0011_phase_k_ndu_location.sql',import.meta.url),'utf8'));
  const env={DB:{prepare(sql){return{bind(...params){return{
    all:async()=>({results:db.prepare(sql).all(...params)}),
    first:async()=>db.prepare(sql).get(...params),
  };}};}}};
  const request=async(path)=>{
    const url=new URL(path,'https://api.example');
    const response=await phaseB({request:new Request(url),url,env,user:null,json:(data,status=200)=>Response.json(data,{status}),readJson:async()=>null,rateLimit:async()=>{},isAdmin:false});
    return await response.json();
  };
  const acronym=await request('/v1/public/institutions?q=UNILAG');
  assert.equal(acronym.institutions[0].id,unilag);
  const nduSearch=await request('/v1/public/institutions?state=Bayelsa&q=NDU');
  assert.equal(nduSearch.institutions[0].id,ndu);
  assert.equal(nduSearch.institutions[0].name,'Niger Delta University, Amassoma');
  assert.equal((await request('/v1/public/institutions?state=Bayelsa&q=Yenagoa')).institutions.some(item=>item.id===ndu),true);
  assert.equal((await request('/v1/public/institutions?state=Lagos&q=NDU')).institutions.length,0);
  const academics=await request(`/v1/public/institutions/${ndu}/academics`);
  assert.equal(academics.institutionId,ndu);
  assert.equal(academics.verified,true);
  await assert.rejects(()=>request('/v1/public/institutions/00000000000000000000/academics'),/Institution not in our directory/);
  db.close();
});
