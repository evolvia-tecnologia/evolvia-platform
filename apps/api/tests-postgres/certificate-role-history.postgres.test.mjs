// Disposable CI database only; fixture rows are preserved.
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {CertificateRoleService} from '../dist/certificate-role.service.js';
const db=new PrismaClient();after(()=>db.$disconnect());
test('PostgreSQL pagina histórico estável e recusa cursor de outro papel/evento/organização',async()=>{
 const key=randomUUID();
 const owner=await db.user.create({data:{name:'PG histórico',email:`history-${key}@evolvia-ci.local`,passwordHash:'fixture'}});
 const makeOrg=()=>db.organization.create({data:{name:'PG histórico',slug:`history-${randomUUID()}`,createdById:owner.id}});
 const org=await makeOrg(),otherOrg=await makeOrg();
 const makeEvent=organizationId=>db.event.create({data:{ownerId:owner.id,organizationId,name:'Histórico',slug:`history-${randomUUID()}`,eventType:'Congresso',format:'IN_PERSON',registrationMode:'FREE'}});
 const event=await makeEvent(org.id),otherEvent=await makeEvent(org.id),foreignEvent=await makeEvent(otherOrg.id);
 const row=(extra={})=>({id:randomUUID(),eventId:event.id,organizationId:org.id,role:'guest',issuedCount:0,skippedCount:0,truncated:false,createdByUserId:owner.id,createdAt:new Date('2026-10-26T05:00:00Z'),...extra});
 const entries=Array.from({length:45},()=>row());await db.eventRoleCertificateBatch.createMany({data:entries});
 const service=new CertificateRoleService(db,{requireRole:async(user,organizationId)=>{assert.equal(user,owner.id);assert.equal(organizationId,org.id);}});
 const first=await service.listBatches(owner.id,event.id,'guest');assert.equal(first.length,20);
 await db.eventRoleCertificateBatch.create({data:row({createdAt:new Date('2026-10-27T05:00:00Z')})});
 const second=await service.listBatches(owner.id,event.id,'guest',first.at(-1).id);
 const third=await service.listBatches(owner.id,event.id,'guest',second.at(-1).id);
 const all=[...first,...second,...third];assert.equal(third.length,5);
 assert.deepEqual(all.map(r=>r.id),entries.map(r=>r.id).sort().reverse());
 for(const data of [row({role:'reviewer'}),row({eventId:otherEvent.id}),row({eventId:foreignEvent.id,organizationId:otherOrg.id})]){
  await db.eventRoleCertificateBatch.create({data});
  await assert.rejects(service.listBatches(owner.id,event.id,'guest',data.id),/não encontrado/);
 }
 assert.deepEqual(Object.keys(first[0]).sort(),['createdAt','id','issuedCount','role','skippedCount','truncated']);
});
