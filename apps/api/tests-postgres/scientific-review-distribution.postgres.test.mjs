// Only the disposable CI database; fixtures are unique and never deleted.
import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {ScientificReviewDistributionService} from '../dist/scientific-review-distribution.service.js';
const a=new PrismaClient(),b=new PrismaClient();
after(async()=>{await Promise.all([a.$disconnect(),b.$disconnect()]);});
async function fixture(){
 const key=randomUUID();
 const owner=await a.user.create({data:{name:'PG distribuição',email:`review-${key}@evolvia-ci.local`,passwordHash:'fixture'}});
 const org=await a.organization.create({data:{name:'PG distribuição',slug:`review-${key}`,createdById:owner.id}});
 const event=await a.event.create({data:{ownerId:owner.id,organizationId:org.id,name:'Distribuição científica',slug:`review-${key}`,profileCode:'SCIENTIFIC_EVENT',eventType:'Congresso',format:'IN_PERSON',registrationMode:'FREE'}});
 const scope={eventId:event.id,organizationId:org.id};
 await a.scientificSubmissionConfig.create({data:{...scope,reviewersPerSubmission:1}});
 const modality=await a.scientificSubmissionModality.create({data:{...scope,code:'ORAL',name:'Oral'}});
 const work=await a.scientificSubmission.create({data:{...scope,modalityId:modality.id,title:'Trabalho original',status:'SUBMITTED',currentVersion:1,submittedAt:new Date()}});
 const version=await a.scientificSubmissionVersion.create({data:{...scope,submissionId:work.id,versionNumber:1,title:work.title,contentHash:'fixture',submittedAt:new Date()}});
 for(const n of [1,2])await a.scientificPerson.create({data:{...scope,name:`Avaliador ${n}`,email:`reviewer-${n}-${key}@evolvia-ci.local`}});
 const auth={requireRole:async(user,organization)=>{assert.equal(user,owner.id);assert.equal(organization,org.id);}};
 return{owner,event,scope,work,version,auth};
}
test('duas conexões distribuem o mesmo trabalho sem ultrapassar teto; retry não duplica auditoria',{timeout:60000},async()=>{
 const f=await fixture();const one=new ScientificReviewDistributionService(a,f.auth),two=new ScientificReviewDistributionService(b,f.auth);
 let arrived=0,release;const barrier=new Promise(r=>{release=r;});
 // Both calls authorize and read the event before entering their transactions.
 for(const service of [one,two]){const original=service.eventFor.bind(service);service.eventFor=async(...args)=>{const event=await original(...args);if(++arrived===2)release();await barrier;return event;};}
 const results=await Promise.allSettled([one.apply(f.owner.id,f.event.id),two.apply(f.owner.id,f.event.id)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));
 for(const r of results)if(r.status==='rejected'){
  const reason=r.reason;
  const safeToken=value=>typeof value==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(value)?value:'unavailable';
  const diagnostic={name:safeToken(reason?.name),code:safeToken(reason?.code),sqlstate:safeToken(reason?.meta?.code)};
  assert.equal(reason?.getStatus?.(),409,JSON.stringify(diagnostic));
 }
 const assigned=await a.scientificReviewAssignment.findMany({where:f.scope});
 assert.equal(assigned.length,1);assert.equal(assigned[0].submissionId,f.work.id);assert.equal(assigned[0].versionId,f.version.id);
 assert.equal((await a.scientificSubmission.findUniqueOrThrow({where:{id:f.work.id}})).status,'UNDER_REVIEW');
 const before=await a.auditLog.count({where:f.scope});assert.equal(before,3);
 assert.deepEqual(await two.apply(f.owner.id,f.event.id),{assignedCount:0,pending:false,cap:1});
 assert.equal(await a.scientificReviewAssignment.count({where:f.scope}),1);
 assert.equal(await a.auditLog.count({where:f.scope}),before);
});
test('ACL recusada não distribui nem audita no PostgreSQL',{timeout:30000},async()=>{
 const f=await fixture();const denied=new ScientificReviewDistributionService(a,{requireRole:async()=>{throw Error('negado');}});
 await assert.rejects(denied.apply('intruso',f.event.id),/negado/);
 assert.equal(await a.scientificReviewAssignment.count({where:f.scope}),0);
 assert.equal(await a.auditLog.count({where:f.scope}),0);
});
