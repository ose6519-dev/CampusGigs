import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseProfileUpdate, parseMode } from '../src/validation.ts';
import { verifyFirebaseToken, AuthError } from '../src/auth.ts';
import { assertAdminAccess, escapeLike, parseMemberSearch, AdminAccessError } from '../src/admin.ts';

test('admin privilege is granted only by D1 role to verified active identities', () => {
  assert.doesNotThrow(() => assertAdminAccess('admin', true, 'active'));
  for (const args of [['member', true, 'active'], ['admin', false, 'active'], ['admin', true, 'suspended'], [null, true, 'active']]) {
    assert.throws(() => assertAdminAccess(...args), AdminAccessError);
  }
});

test('member search validates paging and escapes SQLite LIKE wildcards', () => {
  assert.deepEqual(parseMemberSearch(new URL('https://example.com/v1/admin/members?search=Pere&offset=25')), {search:'Pere',offset:25,limit:25});
  assert.equal(escapeLike('A%_\\B'), 'A\\%\\_\\\\B');
  assert.throws(() => parseMemberSearch(new URL('https://example.com/?offset=-3')));
  assert.throws(() => parseMemberSearch(new URL('https://example.com/?search='+'x'.repeat(81))));
});

test('profile validation strips whitespace and enforces exact permitted fields', () => {
  assert.deepEqual(parseProfileUpdate({ displayName: '  Pere  ', city: ' Yenagoa ' }), {
    displayName: 'Pere', bio: undefined, campus: undefined, city: 'Yenagoa', avatarUrl: undefined,
  });
  assert.throws(() => parseProfileUpdate({ role: 'admin' }), /Unknown profile field/);
  assert.throws(() => parseProfileUpdate({ firebase_uid: 'someone-else' }), /Unknown profile field/);
  assert.throws(() => parseProfileUpdate({ avatarUrl: 'http://unsafe.example' }), /HTTPS/);
});

test('account mode accepts exactly buying and providing', () => {
  assert.equal(parseMode({ mode: 'buying' }), 'buying');
  assert.equal(parseMode({ mode: 'providing' }), 'providing');
  assert.throws(() => parseMode({ mode: 'admin' }), /Mode must/);
  assert.throws(() => parseMode({ mode: 'buying', is_admin: true }), /Mode must/);
});

test('Firebase authentication rejects missing and malformed bearer tokens', async () => {
  await assert.rejects(verifyFirebaseToken(new Request('https://api.example/v1/me'), 'sample-project'), AuthError);
  await assert.rejects(verifyFirebaseToken(new Request('https://api.example/v1/me', {
    headers: { Authorization: 'Bearer tampered.jwt.token' },
  }), 'sample-project'), AuthError);
});

test('isolated D1 migration creates profiles, roles and write throttles', () => {
  const sql = readFileSync(new URL('../migrations/0001_profiles.sql', import.meta.url), 'utf8');
  const database = new DatabaseSync(':memory:');
  database.exec(sql);
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const name of ['profiles', 'platform_roles', 'api_rate_limits']) assert.ok(tables.includes(name));
  database.prepare('INSERT INTO profiles(firebase_uid,display_name) VALUES(?,?)').run('uid-1', 'Pere');
  database.prepare('INSERT INTO platform_roles(firebase_uid,role) VALUES(?,?)').run('uid-1', 'admin');
  assert.throws(() => database.prepare('INSERT INTO platform_roles(firebase_uid,role) VALUES(?,?)').run('unknown', 'admin'));
  assert.throws(() => database.prepare('UPDATE profiles SET active_mode = ? WHERE firebase_uid = ?').run('admin', 'uid-1'));
  database.close();
});
