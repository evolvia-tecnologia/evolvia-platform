import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../src/participant-area.service.ts', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/participant-area.controller.ts', import.meta.url), 'utf8');
const policy = await readFile(new URL('../src/participant-registration-edit-policy.ts', import.meta.url), 'utf8');
const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(new URL('../prisma/migrations/20260925120000_participant_registration_corrections/migration.sql', import.meta.url), 'utf8');

test('correção exige sessão curta e escopo composto', () => {
  assert.match(controller, /@Patch\('registration'\)/u);
  assert.match(service, /requireEditableScope/u);
  assert.match(service, /id_eventId_organizationId: scope/u);
  assert.match(service, /organizationId: scope\.organizationId/u);
  assert.match(service, /eventId: scope\.eventId/u);
});

test('identidade, comercial, pagamento e fiscal permanecem bloqueados', () => {
  for (const code of ['identity_document', 'email', 'registration_type', 'category', 'lot', 'payment', 'billing']) {
    assert.match(policy, new RegExp(`'${code}'`, 'u'));
  }
  assert.match(policy, /A tentativa inclui um campo protegido/u);
  assert.doesNotMatch(service, /identityHash:\s|emailHash:\s|billingSnapshot:\s|categoryId:\s|lotId:\s/u);
});

test('concorrência, idempotência e auditoria sem PII são obrigatórias', () => {
  assert.match(service, /registrationRevision: patch\.expectedRevision/u);
  assert.match(service, /idempotencyKeyHash/u);
  assert.match(service, /payloadHash/u);
  assert.match(service, /TransactionIsolationLevel\.Serializable/u);
  assert.match(service, /changedFieldCodes/u);
  const audit = service.slice(service.indexOf("action: 'participant.registration_data_corrected'"), service.indexOf("  async requireConfirmedScope"));
  assert.doesNotMatch(audit, /previousEditableData|nextEditableData|registrationData/u);
});

test('migration é aditiva, idempotente e preserva histórico escopado', () => {
  assert.match(schema, /model ParticipantRegistrationRevision/u);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "registrationRevision"/u);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "ParticipantRegistrationRevision"/u);
  assert.match(migration, /FOREIGN KEY \("reservationId", "eventId", "organizationId"\)/u);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/u);
});
