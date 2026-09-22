import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('persistência isola organização e evento com migration aditiva', async () => {
  const [schema, migration] = await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20260922160500_registration_benefits/migration.sql'),
  ]);
  assert.match(schema, /model EventRegistrationBenefitCatalog/u);
  assert.match(schema, /model EventRegistrationBenefit/u);
  assert.match(migration, /FOREIGN KEY \("eventId", "organizationId"\)/u);
  assert.match(migration, /FOREIGN KEY \("catalogId", "eventId", "organizationId"\)/u);
  assert.match(migration, /usedCount[\s\S]*maxUses/u);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|TYPE)|DELETE\s+FROM/iu);
});

test('API exige autenticação, revisão, ACL, evento mutável e transação', async () => {
  const [controller, service] = await Promise.all([
    read('../src/registration-benefits.controller.ts'),
    read('../src/registration-benefits.service.ts'),
  ]);
  assert.match(controller, /@UseGuards\(AuthGuard\)/u);
  assert.match(service, /requireRole\(userId, event\.organizationId, EVENT_EDITOR_ROLES\)/u);
  assert.match(service, /assertFoundationMutable/u);
  assert.match(service, /\$transaction/u);
  assert.match(service, /expectedRevision/u);
  assert.match(service, /updateMany/u);
});

test('auditoria não persiste códigos e resgate público permanece bloqueado', async () => {
  const service = await read('../src/registration-benefits.service.ts');
  assert.match(service, /registration\.benefit_catalog_saved/u);
  assert.match(service, /publicRedemptionEnabled: false/u);
  const metadata = service.match(/metadata: \{[\s\S]*?\} as Prisma\.InputJsonObject/u)?.[0] ?? '';
  assert.doesNotMatch(metadata, /code|name|validFrom|validUntil/u);
  assert.doesNotMatch(service, /Asaas|webhook|checkoutUrl|pixKey/iu);
});
