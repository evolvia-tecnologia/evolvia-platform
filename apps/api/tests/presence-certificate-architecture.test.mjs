import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../src/presence-certificate.service.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../prisma/migrations/20261006234500_presence_certificate/migration.sql', import.meta.url), 'utf8');
const participant = await readFile(new URL('../src/participant-area.service.ts', import.meta.url), 'utf8');

test('consulta pública devolve só o documento verificável', () => {
  const view = service.slice(service.indexOf('async publicView'), service.indexOf('async offer'));
  assert.match(view, /publicCertificateView/u);
  assert.match(view, /displayName: true, hours: true, issuedAt: true, event: \{ select: \{ name: true \} \}/u);
  assert.doesNotMatch(view, /registrationData|protocol|identityDocument|email|cpf|taxId|wallet|organizationId/iu);
});

test('reemissão não gera outra auditoria e o escopo vem do evento', () => {
  const issue = service.slice(service.indexOf('async issue'), service.indexOf('async get'));
  const existing = issue.indexOf('if (existing) return this.participantCopy');
  const audit = issue.indexOf("action: 'certificate.issued'");
  assert.ok(existing >= 0 && audit > existing);
  assert.equal(issue.match(/certificate\.issued/gu).length, 1);
  assert.match(issue, /organizationId: input\.organizationId/u);
  assert.match(issue, /eventId: input\.eventId/u);
  assert.doesNotMatch(service, /body\.organizationId|dto\.organizationId|input\.organizationId\s*=/u);
  assert.match(issue, /feeCents: certificateFeeCents\(\)/u);
});

test('a área do participante não emite sem o serviço e a migration não apaga evidência', () => {
  assert.match(participant, /this\.certificates\.offer\(/u);
  assert.match(participant, /this\.certificates\.issue\(/u);
  assert.match(participant, /organizationId: session\.organizationId/u);
  assert.match(migration, /CREATE TABLE "EventCertificate"/u);
  assert.match(migration, /REFERENCES "Event"\("id", "organizationId"\)/u);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|feeCents|amountCents/u);
});
