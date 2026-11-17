import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();after(()=>db.$disconnect());
async function probe(overrides={}){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('CREATE TEMP TABLE role_batch_probe (LIKE "EventRoleCertificateBatch" INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP');
  const row={id:'11111111-1111-4111-8111-111111111111',organizationId:'org-a',eventId:'event-a',role:'guest',issuedCount:1,skippedCount:0,truncated:false,createdByUserId:'editor',...overrides};
  const keys=Object.keys(row);await tx.$executeRawUnsafe(`INSERT INTO role_batch_probe (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,...Object.values(row));
  return tx.$queryRawUnsafe('SELECT "issuedCount" FROM role_batch_probe');
 });
}
test('pacote de papel aceita vazio/40 e rejeita estouro, contagem negativa e papel desconhecido',async()=>{
 for(const issuedCount of [0,40])assert.equal((await probe({issuedCount}))[0].issuedCount,issuedCount);
 for(const data of [{issuedCount:41},{issuedCount:-1},{alreadyIssuedCount:41},{alreadyIssuedCount:40,issuedCount:1},{skippedCount:-1},{role:'other'}])await assert.rejects(probe(data),/check/);
});
test('FK migrada de pacote inclui papel/evento/organização e não remove em cascata',async()=>{
 const definitions=await db.$queryRaw`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='EventRoleCertificate_batchId_eventId_organizationId_role_fkey'`;
 assert.equal(definitions.length,1);assert.match(definitions[0].definition,/FOREIGN KEY \("batchId", "eventId", "organizationId", "?role"?\)/);assert.match(definitions[0].definition,/ON DELETE RESTRICT/);
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('CREATE TEMP TABLE role_parent_probe (LIKE "EventRoleCertificateBatch" INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP');
  await tx.$executeRawUnsafe('ALTER TABLE role_parent_probe ADD UNIQUE (id,"eventId","organizationId",role)');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE role_child_probe ("batchId" TEXT,"eventId" TEXT,"organizationId" TEXT,role TEXT, FOREIGN KEY ("batchId","eventId","organizationId",role) REFERENCES role_parent_probe(id,"eventId","organizationId",role)) ON COMMIT DROP');
  await tx.$executeRawUnsafe(`INSERT INTO role_parent_probe (id,"eventId","organizationId",role,"issuedCount","skippedCount",truncated,"createdByUserId") VALUES ('batch-a','event-a','org-a','guest',1,0,false,'editor')`);
  await tx.$executeRawUnsafe(`INSERT INTO role_child_probe VALUES ('batch-a','event-a','org-a','guest')`);
  for(const [event,org,role]of[['event-b','org-a','guest'],['event-a','org-b','guest'],['event-a','org-a','reviewer']]){
   await tx.$executeRawUnsafe('SAVEPOINT wrong_scope');
   await assert.rejects(tx.$executeRawUnsafe('INSERT INTO role_child_probe VALUES ($1,$2,$3,$4)','batch-a',event,org,role),/foreign key/);
   await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT wrong_scope');
  }
 });
});
