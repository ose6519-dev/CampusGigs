import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parsePublicGigFilters, publicGigQuery } from '../src/publicGigs.ts';

const filters = (search = '') => parsePublicGigFilters(new URL(`https://api.example/v1/public/gigs${search}`));

test('Phase C validates category, sorting and safe pagination', () => {
  assert.equal(filters('?category=Design%20%26%20Creative').category, 'Design & Creative');
  assert.equal(filters('?sort=price_low&limit=12&offset=24').offset, 24);
  for (const search of ['?category=Homework', '?sort=DROP%20TABLE', '?offset=-1', '?limit=0',
    '?minPrice=100&maxPrice=99', '?minPrice=1.25', '?limit=25', '?q=x&q=y', '?admin=true']) {
    assert.throws(() => filters(search), `Accepted invalid filter: ${search}`);
  }
  assert.ok(publicGigQuery(filters('?q=%25_%5C')).params[0].includes('\\%\\_\\\\'));
});

test('Phase C search only returns active gigs from approved, active providers', () => {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0001_profiles.sql', '0002_providers_gigs.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  db.prepare('INSERT INTO profiles(firebase_uid,display_name,campus,city) VALUES (?,?,?,?)').run('admin', 'Admin', 'NDU', 'Yenagoa');
  for (const id of ['active', 'suspended', 'hidden']) {
    db.prepare('INSERT INTO profiles(firebase_uid,display_name,campus,city) VALUES (?,?,?,?)').run(id, `Name ${id}`, 'Niger Delta University', 'Yenagoa');
    db.prepare('INSERT INTO provider_applications (id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key,status) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(`a-${id}`, id, '["Design & Creative"]', 'NDU', 'campus', 'Professional creative skills', 'student_id', `evidence/${id}`, 'approved');
    db.prepare('INSERT INTO provider_profiles(firebase_uid,application_id,approved_by_uid) VALUES (?,?,?)').run(id, `a-${id}`, 'admin');
    db.prepare('INSERT INTO gigs(id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(`g-${id}`, id, `Logo design ${id}`, 'Professional logos and brand assets, with editable source files.', 'Design & Creative', 500000, 3, 'online', 'Yenagoa', 'preview');
  }
  db.exec("UPDATE provider_profiles SET provider_status='suspended' WHERE firebase_uid='suspended'");
  db.exec("UPDATE gigs SET status='paused' WHERE provider_uid='hidden'");
  const query = (filterSearch) => {
    const { sql, params } = publicGigQuery(filters(filterSearch));
    return db.prepare(`SELECT g.id FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid JOIN profiles p ON p.firebase_uid=g.provider_uid ${sql}`).all(...params).map((row) => row.id);
  };
  assert.deepEqual(query(''), ['g-active']);
  assert.deepEqual(query('?q=logo&location=Yenagoa&category=Design%20%26%20Creative'), ['g-active']);
  assert.deepEqual(query('?q=%25%27%20OR%201%3D1%20--'), []);
  assert.deepEqual(query('?maxPrice=4000'), []);
  assert.deepEqual(query('?minPrice=5000&maxPrice=5000'), ['g-active']);
  db.close();
});
