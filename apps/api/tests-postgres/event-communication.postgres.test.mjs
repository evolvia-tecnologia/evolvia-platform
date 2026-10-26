import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
after(async () => prisma.$disconnect());
async function probe(subject, revision) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE communication_probe (LIKE "EventCommunicationDraft" INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP');
    return tx.$executeRaw`INSERT INTO communication_probe ("id", "organizationId", "eventId", "subject", "body", "revision", "updatedAt") VALUES ('12345678-1234-4123-8123-123456789abc'::uuid, 'org-a', 'event-a', ${subject}, '', ${revision}, NOW())`;
  });
}
test('rascunho migrado aceita mensagem vazia em edição e exige assunto e revisão válida', async () => {
  assert.equal(await probe('Aviso', 1), 1);
  for (const [subject, revision] of [[' ',1], ['Aviso',0], ['x'.repeat(181),1]]) await assert.rejects(probe(subject,revision));
});
test('FK composta mantém evento e organização vinculados e preserva rascunhos no rollback', async () => {
  const constraints = await prisma.$queryRaw`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = '"EventCommunicationDraft"'::regclass AND contype = 'f'`;
  assert.equal(constraints.length,1);
  assert.match(constraints[0].definition, /FOREIGN KEY \("eventId", "organizationId"\) REFERENCES "Event"\(id, "organizationId"\)/);
  assert.match(constraints[0].definition, /ON DELETE RESTRICT/);
});
