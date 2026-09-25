import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20260921224000_registration_commercial_categories_lots/migration.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/registration-commercial.service.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/registration-commercial.controller.ts', import.meta.url), 'utf8');

test('modelo comercial é isolado por organização e evento', () => {
  assert.match(schema, /model EventRegistrationCatalog\s*\{/u);
  assert.match(schema, /model EventRegistrationCategory\s*\{/u);
  assert.match(schema, /model EventRegistrationLot\s*\{/u);
  assert.match(migration, /FOREIGN KEY \("eventId", "organizationId"\)/u);
  assert.match(migration, /FOREIGN KEY \("catalogId", "eventId", "organizationId"\)/u);
  assert.match(migration, /FOREIGN KEY \("categoryId", "eventId", "organizationId"\)/u);
});

test('migration é aditiva e preserva rollback da aplicação', () => {
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|TYPE)/iu);
  assert.doesNotMatch(migration, /DELETE\s+FROM/iu);
  assert.match(migration, /priceCents/u);
});

test('API exige autenticação, revisão otimista e evento mutável', () => {
  assert.match(controller, /@UseGuards\(AuthGuard\)/u);
  assert.match(service, /expectedRevision/u);
  assert.match(service, /updateMany/u);
  assert.match(service, /revision: input\.expectedRevision/u);
  assert.match(service, /advanced\.count !== 1/u);
  assert.match(service, /ConflictException/u);
  assert.match(service, /assertFoundationMutable/u);
});

test('escritas usam escopo composto e auditoria sem conteúdo comercial', () => {
  assert.match(service, /const scope = \{ eventId, organizationId \}/u);
  assert.match(service, /registration\.commercial_catalog_saved/u);
  assert.match(service, /categoryCount/u);
  assert.match(service, /lotCount/u);
  assert.doesNotMatch(service, /metadata:\s*\{[^}]*priceCents/su);
});

test('checkout permanece bloqueado e não há integração financeira antecipada', () => {
  assert.match(service, /publicRegistrationEnabled: false/u);
  assert.doesNotMatch(service + controller, /Asaas|webhook|checkoutUrl|pixKey/iu);
});
