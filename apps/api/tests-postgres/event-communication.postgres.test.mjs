import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EventCommunicationAudienceService } from '../dist/event-communication-audience.service.js';
import { AuthorizationService } from '../dist/authorization.service.js';
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

test('prévia de autores e coautores usa relações reais, sem inscrição e sem atravessar evento/org', async () => {
  const rollback = new Error('rollback da fixture isolada');
  await assert.rejects(prisma.$transaction(async tx => {
    const run=randomUUID();
    const owner=await tx.user.create({data:{name:'Organizador fictício',email:`owner-${run}@example.test`,passwordHash:'fixture'}});
    const operator=await tx.user.create({data:{name:'Operador fictício',email:`operator-${run}@example.test`,passwordHash:'fixture'}});
    const org=await tx.organization.create({data:{name:'Organização fixture',slug:`org-${run}`,createdById:owner.id}});
    const other=await tx.organization.create({data:{name:'Outra fixture',slug:`other-${run}`,createdById:owner.id}});
    await tx.organizationMembership.createMany({data:[{organizationId:org.id,userId:owner.id,role:'MANAGER'},{organizationId:org.id,userId:operator.id,role:'OPERATOR'}]});
    const eventFor=async (organizationId,suffix)=>tx.event.create({data:{organizationId,ownerId:owner.id,name:'Evento fixture',slug:`event-${suffix}-${run}`,eventType:'Congresso',format:'IN_PERSON',registrationMode:'FREE',status:'PUBLISHED',profileCode:'SCIENTIFIC_EVENT'}});
    const event=await eventFor(org.id,'a'),peer=await eventFor(org.id,'b'),foreign=await eventFor(other.id,'c');
    const scope={eventId:event.id,organizationId:org.id};
    const modality=await tx.scientificSubmissionModality.create({data:{...scope,code:'ORAL',name:'Oral'}});
    const person=async(name,email,status='ACTIVE')=>tx.scientificPerson.create({data:{...scope,name,email,status}});
    const correspondent=await person('Correspondente','CORRESPONDENTE@example.test');
    const coauthor=await person('Coautora','coautora@example.test');
    const missing=await person('Sem contato',null);
    const inactive=await person('Inativa','inativa@example.test','INACTIVE');
    const submission=async(status,submittedAt)=>tx.scientificSubmission.create({data:{...scope,modalityId:modality.id,title:'Trabalho fixture',status,submittedAt}});
    const accepted=await submission('ACCEPTED',new Date()),review=await submission('UNDER_REVIEW',new Date()),draft=await submission('DRAFT',null),notSubmitted=await submission('ACCEPTED',null);
    const author=async(submissionId,personId,sortOrder,isCorresponding=false)=>tx.scientificSubmissionAuthor.create({data:{...scope,submissionId,personId,sortOrder,isCorresponding,nameSnapshot:`Snapshot ${sortOrder}`}});
    await author(accepted.id,correspondent.id,1,true);await author(accepted.id,coauthor.id,2);await author(accepted.id,missing.id,3);await author(accepted.id,inactive.id,4);
    await author(review.id,coauthor.id,1);await author(draft.id,coauthor.id,1);await author(notSubmitted.id,correspondent.id,1);
    const service=new EventCommunicationAudienceService(tx,new AuthorizationService(tx));
    const all=await service.preview(owner.id,event.id,{audience:'ALL_SCIENTIFIC_AUTHORS'});
    assert.equal(all.matchedAuthors,4);assert.equal(all.total,2);assert.equal(all.missingEmail,1);assert.equal(all.duplicates,1);assert.equal(all.sendingAvailable,false);
    assert.deepEqual(all.items.map(row=>row.email).sort(),['coautora@example.test','correspondente@example.test']);
    assert.equal((await service.preview(owner.id,event.id,{audience:'CORRESPONDING_AUTHORS'})).total,1);
    const filtered=await service.preview(owner.id,event.id,{audience:'ALL_SCIENTIFIC_AUTHORS',submissionStatus:'UNDER_REVIEW'});assert.equal(filtered.total,1);assert.equal(filtered.matchedAuthors,1);
    assert.equal((await service.preview(owner.id,peer.id,{audience:'ALL_SCIENTIFIC_AUTHORS'})).total,0);
    await assert.rejects(service.preview(owner.id,foreign.id,{audience:'ALL_SCIENTIFIC_AUTHORS'}),e=>e.getStatus()===404);
    await assert.rejects(service.preview(operator.id,event.id,{audience:'ALL_SCIENTIFIC_AUTHORS'}),e=>e.getStatus()===404);
    assert.equal(await tx.eventRegistrationReservation.count({where:scope}),0);
    throw rollback;
  }, {timeout:30000}),error=>error===rollback);
});

