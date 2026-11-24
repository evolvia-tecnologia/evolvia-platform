import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('migration da foto só adiciona coluna opcional', () => {
  const sql = read('../prisma/migrations/20261012020000_guest_portrait_url/migration.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "portraitUrl" TEXT/u);
  assert.doesNotMatch(sql, /DROP |DELETE |TRUNCATE |ALTER COLUMN/iu);
});

test('página pública não seleciona rede social nem e-mail junto da foto', () => {
  const service = read('../src/scientific-program-public.service.ts');
  assert.match(service, /portraitUrl: true/u);
  assert.doesNotMatch(service, /websiteUrl|linkedinUrl|email: true/u);
  const policy = read('../src/scientific-program-public-policy.ts');
  const returned = policy.slice(policy.indexOf('return [{'));
  assert.match(returned, /portraitUrl: publishedPortraitUrl\(profile\.portraitUrl\)/u);
  assert.doesNotMatch(returned, /websiteUrl|linkedinUrl|email/);
});

test('gravação da foto passa pelo validador e a auditoria não copia o endereço', () => {
  const service = read('../src/scientific-guests.service.ts');
  assert.match(service, /portraitUrl: this\.portrait\(dto\.portraitUrl\)/u);
  assert.match(service, /publishedPortraitUrl\(value\)/u);
  assert.match(service, /portraitUpdated: dto\.portraitUrl !== undefined/u);
  assert.doesNotMatch(service, /metadata:[\s\S]{0,180}portraitUrl:/u);
});
