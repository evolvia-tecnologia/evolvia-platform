import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();after(()=>db.$disconnect());
async function probe(overrides={}){
  return db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('CREATE TEMP TABLE certificate_batch_probe (LIKE "EventCertificateBatch" INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP');
    const row={id:'11111111-1111-4111-8111-111111111111',organizationId:'org-a',eventId:'event-a',requestHash:'a'.repeat(64),issuedCount:1,scannedCount:1,skippedCount:0,createdByUserId:'editor',hours:8,...overrides};
    const keys=Object.keys(row);await tx.$executeRawUnsafe(`INSERT INTO certificate_batch_probe (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,...Object.values(row));
    return tx.$queryRawUnsafe('SELECT "issuedCount", "scannedCount" FROM certificate_batch_probe');
  });
}
test('migration aceita lote vazio idempotente e quarenta emissões; recusa contagens e horas inconsistentes',async()=>{
  assert.equal((await probe({issuedCount:0,scannedCount:400,skippedCount:400}))[0].issuedCount,0);
  assert.equal((await probe({issuedCount:40,scannedCount:42,skippedCount:2}))[0].issuedCount,40);
  for(const input of [{issuedCount:41,scannedCount:41},{scannedCount:401,skippedCount:400},{scannedCount:2},{skippedCount:-1},{hours:0},{hours:1000}])await assert.rejects(probe(input),/check/);
});
test('FK migrada do pacote mantém organização e evento na identidade composta',async()=>{
  const constraints=await db.$queryRaw`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'EventCertificate_batchId_fkey'`;
  assert.equal(constraints.length,1);assert.match(constraints[0].definition,/FOREIGN KEY \("batchId", "eventId", "organizationId"\)/);assert.match(constraints[0].definition,/ON DELETE RESTRICT/);
  await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('CREATE TEMP TABLE batch_scope_probe (LIKE "EventCertificateBatch" INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP');
    await tx.$executeRawUnsafe('ALTER TABLE batch_scope_probe ADD UNIQUE ("id", "eventId", "organizationId")');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE batch_child_probe ("batchId" TEXT,"eventId" TEXT,"organizationId" TEXT, FOREIGN KEY ("batchId","eventId","organizationId") REFERENCES batch_scope_probe("id","eventId","organizationId")) ON COMMIT DROP');
    await tx.$executeRawUnsafe(`INSERT INTO batch_scope_probe ("id","organizationId","eventId","requestHash","issuedCount","scannedCount","skippedCount","createdByUserId") VALUES ('batch-a','org-a','event-a','hash',1,1,0,'editor')`);
    await tx.$executeRawUnsafe(`INSERT INTO batch_child_probe VALUES ('batch-a','event-a','org-a')`);
    await tx.$executeRawUnsafe('SAVEPOINT wrong_scope');
    await assert.rejects(tx.$executeRawUnsafe(`INSERT INTO batch_child_probe VALUES ('batch-a','event-b','org-a')`),/foreign key/);
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT wrong_scope');
  });
});
