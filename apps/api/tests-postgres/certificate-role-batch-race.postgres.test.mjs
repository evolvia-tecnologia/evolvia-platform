// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {CertificateRoleService} from '../dist/certificate-role.service.js';
const a=new PrismaClient(),b=new PrismaClient();after(async()=>{await Promise.all([a.$disconnect(),b.$disconnect()]);});
test('duas conexões no mesmo lote criam um pacote e uma emissão; retry recupera sem nova auditoria',{timeout:60000},async()=>{
 const key=randomUUID();
 const owner=await a.user.create({data:{name:'PG certificados',email:`certificate-${key}@evolvia-ci.local`,passwordHash:'fixture'}});
 const organization=await a.organization.create({data:{name:'PG certificados',slug:`certificate-${key}`,createdById:owner.id}});
 const event=await a.event.create({data:{ownerId:owner.id,organizationId:organization.id,name:'Evento original',slug:`certificate-${key}`,eventType:'Congresso',format:'IN_PERSON',registrationMode:'FREE'}});
 const scope={eventId:event.id,organizationId:organization.id};
 const person=await a.scientificPerson.create({data:{...scope,name:'Convidada original'}});
 await a.scientificGuestProfile.create({data:{...scope,personId:person.id,participationType:'SPEAKER',invitationStatus:'CONFIRMED'}});
 await a.eventCertificateRoleSetting.create({data:{...scope,role:'guest',enabled:true,title:'Original {EVENTO}',body:'{NOME}',backBody:'Verso {NOME} — {CARGA_HORARIA} h',hours:8}});
 const auth={requireRole:async(user,org)=>{assert.equal(user,owner.id);assert.equal(org,organization.id);}};
 const one=new CertificateRoleService(a,auth),two=new CertificateRoleService(b,auth);
 // Barrier after the external selection, before either serializable transaction.
 const gate=()=>{let release;const promise=new Promise(r=>release=r);return{promise,release};};
 const barrier=gate();let arrived=0;
 for(const service of [one,two]){
  const select=service.subjects.bind(service);
  service.subjects=async(...args)=>{const result=await select(...args);if(args.length===3){if(++arrived===2)barrier.release();await barrier.promise;}return result;};
 }
 const request={batchId:key};
 const results=await Promise.allSettled([one.issueEligible(owner.id,event.id,'guest',request),two.issueEligible(owner.id,event.id,'guest',request)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const recovered=await two.issueEligible(owner.id,event.id,'guest',request);
 assert.equal(recovered.created,1);
 assert.equal(await a.eventRoleCertificateBatch.count({where:{...scope,id:key}}),1);
 assert.equal(await a.eventRoleCertificate.count({where:{...scope,batchId:key}}),1);
 assert.equal(await a.auditLog.count({where:{...scope,action:{in:['certificate.role_issued','certificate.role_batch_issued']}}}),2);
 const row=await a.eventRoleCertificate.findFirstOrThrow({where:{...scope,batchId:key}});
 const before=await one.publicView(row.code),pdf=await one.batchPdf(owner.id,event.id,'guest',key);
 await a.eventCertificateRoleSetting.update({where:{eventId_role:{eventId:event.id,role:'guest'}},data:{enabled:false,hours:32,title:'Novo',backBody:'Novo verso'}});
 await a.event.update({where:{id:event.id},data:{name:'Evento renomeado'}});
 assert.deepEqual(await two.issueEligible(owner.id,event.id,'guest',request),recovered);
 assert.deepEqual(await two.publicView(row.code),before);
 assert.deepEqual((await two.batchPdf(owner.id,event.id,'guest',key)).bytes,pdf.bytes);
 assert.match(before.back,/Convidada original.*8 h/);
 await assert.rejects(one.batchPdf(owner.id,event.id,'reviewer',key),/não encontrado/);
});
