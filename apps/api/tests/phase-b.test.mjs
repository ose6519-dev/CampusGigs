import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseProviderApplication, parseGig, parseReview, parseModeration, skillCategories } from '../src/providerValidation.ts';

const sampleApplication = {
  categories: [skillCategories[0],skillCategories[1]],
  locationKind: 'campus', locationName: 'Niger Delta University',
  bio: 'I have three years of experience in web design and branding work.',
  evidenceType: 'student_id', evidenceKey: 'provider-evidence/user123/file.jpg',
};
const sampleGig = {
  title: 'Brand identity and logo design',
  description: 'I will deliver a distinctive logo and brand identity kit with source files.',
  category: skillCategories[0], priceKobo: 500000,
  deliveryDays: 3, locationType: 'online', locationName: 'Yenagoa', paymentOption: 'preview',
};

test('provider applications validate category limits, ID evidence and location', () => {
  assert.equal(parseProviderApplication(sampleApplication).locationKind,'campus');
  assert.throws(()=>parseProviderApplication({...sampleApplication, categories:[]}), /categories/);
  assert.throws(()=>parseProviderApplication({...sampleApplication, categories:['Writing Assignments']}), /categories/);
  assert.throws(()=>parseProviderApplication({...sampleApplication, categories:[skillCategories[0],skillCategories[0]]}), /categories/);
  assert.throws(()=>parseProviderApplication({...sampleApplication, evidenceType:'passport_number'}), /ID type/);
  assert.throws(()=>parseProviderApplication({...sampleApplication, role:'admin'}), /Unknown/);
});

test('gigs require integer kobo and reject prohibited completion services', () => {
  assert.equal(parseGig(sampleGig).priceKobo,500000);
  assert.throws(()=>parseGig({...sampleGig, priceKobo:123.5}), /Price/);
  assert.throws(()=>parseGig({...sampleGig, priceKobo:5000}), /Price/);
  assert.throws(()=>parseGig({...sampleGig, paymentOption:'transfer_direct'}), /payment option/);
  assert.throws(()=>parseGig({...sampleGig, deliveryDays:0}), /Delivery time/);
  assert.throws(()=>parseGig({...sampleGig, title:'I will complete your assignment'}), /assignment completion/);
  assert.doesNotThrow(()=>parseGig({...sampleGig, category:'Typing & Proofreading',title:'Professional proofreading services'}));
});

test('admin review requires reason for rejection, valid moderation action', () => {
  assert.equal(parseReview({decision:'approved'}).note,'');
  assert.throws(()=>parseReview({decision:'rejected',note:''}), /short reason/);
  assert.throws(()=>parseReview({decision:'approved',adminId:'fake'}), /Unknown/);
  assert.equal(parseModeration({decision:'restored'}).decision,'restored');
  assert.throws(()=>parseModeration({decision:'removed',note:'no'}), /Explain why/);
});

test('Phase B schema uses dedicated provider/gig tables and enforces FKs', () => {
  const database = new DatabaseSync(':memory:');
  const migrations = ['0001_profiles.sql','0002_providers_gigs.sql'];
  for (const file of migrations) database.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  for (const name of ['provider_applications','provider_profiles','provider_review_events','gigs','gig_images','gig_moderation_events']) {
    assert.ok(tables.has(name),`missing ${name}`);
  }
  database.prepare('INSERT INTO profiles(firebase_uid,display_name) VALUES (?,?)').run('provider','Pere');
  database.prepare('INSERT INTO profiles(firebase_uid,display_name) VALUES (?,?)').run('admin','Admin');
  assert.throws(()=>database.prepare("INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option) VALUES ('g','provider','A valid title','Some description that is definitely long enough to count for the minimum.','Design & Creative',500000,3,'online','Yenagoa','full')").run(),/FOREIGN KEY/);
  database.prepare('INSERT INTO provider_applications (id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key) VALUES (?,?,?,?,?,?,?,?)')
    .run('app','provider','["Design & Creative"]','NDU','campus','My professional design services','student_id','provider-evidence/provider/file.jpg');
  database.prepare('UPDATE provider_applications SET status=? WHERE id=?').run('approved','app');
  database.prepare('INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid) VALUES (?,?,?)').run('provider','app','admin');
  database.prepare('INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('gig','provider',sampleGig.title,sampleGig.description,sampleGig.category,sampleGig.priceKobo,3,'online','Yenagoa','preview');
  assert.throws(()=>database.prepare('UPDATE gigs SET price_kobo=? WHERE id=?').run(0,'gig'),/CHECK/);
  assert.throws(()=>database.prepare('UPDATE gigs SET location_type=? WHERE id=?').run('at_home','gig'),/CHECK/);
  assert.throws(()=>database.prepare('INSERT INTO gig_images(id,gig_id,object_key,media_type) VALUES (?,?,?,?)').run('img','unknown','gig-images/unknown/img.jpg','image/jpeg'),/FOREIGN KEY/);
  const approved = database.prepare('SELECT provider_status FROM provider_profiles WHERE firebase_uid=?').get('provider');
  assert.equal(approved.provider_status,'active');
  database.close();
});
