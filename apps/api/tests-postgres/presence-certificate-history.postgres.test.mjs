// Disposable CI database only; fixture rows are preserved.
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PresenceCertificateService} from '../dist/presence-certificate.service.js';
const db=new PrismaClient();after(()=>db.$disconnect());
test('PostgreSQL pagina histórico estável e recusa cursor de lote vazio/evento/organização',async()=>{
 const key=randomUUID();
 const owner=await db.user.create({data:{name:'PG histórico',email:`history-${key}@evolvia-ci.local`,passwordHash:'fixture'}});
 const makeOrg=()=>db.organization.create({data:{name:'PG histórico',slug:`history-${randomUUID()}`,createdById:owner.id}});
 const org=await makeOrg(),otherOrg=await makeOrg();
 const makeEvent=organizationId=>db.event.create({data:{ownerId:owner.id,organizationId,name:'Histórico',slug:`history-${randomUUID()}`,eventType:'Congresso',format:'IN_PERSON',registrationMode:'FREE'}});
 const event=await makeEvent(org.id),otherEvent=await makeEvent(org.id),foreignEvent=await makeEvent(otherOrg.id);
 const row=(extra={})=>({id:randomUUID(),eventId:event.id,organizationId:org.id,issuedCount:1,hours:8,scannedCount:1,skippedCount:0,requestHash:'a'.repeat(64),createdByUserId:owner.id,createdAt:new Date('2026-10-26T05:00:00Z'),...extra});
 const entries=Array.from({length:205},()=>row());await db.eventCertificateBatch.createMany({data:entries});
 const service=new PresenceCertificateService(db,{requireRole:async(user,organizationId)=>{assert.equal(user,owner.id);assert.equal(organizationId,org.id);}});
 const first=await service.listBatches(owner.id,event.id);assert.equal(first.length,100);
 await db.eventCertificateBatch.create({data:row({createdAt:new Date('2026-10-27T05:00:00Z')})});
 const second=await service.listBatches(owner.id,event.id,first.at(-1).id);
 const third=await service.listBatches(owner.id,event.id,second.at(-1).id);
 const all=[...first,...second,...third];assert.equal(third.length,5);
 assert.deepEqual(all.map(r=>r.id),entries.map(r=>r.id).sort().reverse());
 for(const data of [row({issuedCount:0}),row({eventId:otherEvent.id}),row({eventId:foreignEvent.id,organizationId:otherOrg.id})]){
  await db.eventCertificateBatch.create({data});
  await assert.rejects(service.listBatches(owner.id,event.id,data.id),/não encontrado/);
 }
 assert.deepEqual(Object.keys(first[0]).sort(),['createdAt','hours','id','issuedCount']);
 const older=row({createdAt:new Date('2026-10-25T05:00:00Z')});
 await db.eventCertificateBatch.create({data:older});
 assert.deepEqual((await service.listBatches(owner.id,event.id,all.at(-1).id)).map(r=>r.id),[older.id]);
});
