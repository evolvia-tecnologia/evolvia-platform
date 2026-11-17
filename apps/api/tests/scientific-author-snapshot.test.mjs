import assert from 'node:assert/strict';
import test from 'node:test';
import { authorIdentitySnapshot, readAuthorIdentity } from '../src/scientific-author-snapshot.ts';

test('editing one work preserves its identity without changing a shared person', () => {
  const person = { name: 'Bia Lima', institution: 'USP' };
  const otherWork = { person, ...authorIdentitySnapshot(person) };
  const edited = { person, ...authorIdentitySnapshot({ name: 'Beatriz Lima', institution: 'Unicamp' }) };
  assert.deepEqual(readAuthorIdentity(edited), { name: 'Beatriz Lima', institution: 'Unicamp' });
  assert.deepEqual(readAuthorIdentity(otherWork), { name: 'Bia Lima', institution: 'USP' });
  assert.deepEqual(person, { name: 'Bia Lima', institution: 'USP' });
});

test('an explicitly cleared institution stays empty on resume', () => {
  assert.equal(readAuthorIdentity({ person: { name: 'Bia', institution: 'USP' }, ...authorIdentitySnapshot({ name: 'Bia', institution: '' }) }).institution, '');
});

test('legacy nullable snapshots preserve the existing identity', () => {
  assert.deepEqual(readAuthorIdentity({ nameSnapshot: null, institutionSnapshot: null, person: { name: 'Ana', institution: 'USP' } }), { name: 'Ana', institution: 'USP' });
  assert.deepEqual(readAuthorIdentity({ person: { name: 'Ana', institution: null } }), { name: 'Ana', institution: '' });
});
