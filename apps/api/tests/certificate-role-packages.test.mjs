import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { CertificateRoleService } from '../dist/certificate-role.service.js';
import { normalizeRoleSetting, publicRoleCertificateView, CERTIFICATE_ROLES, roleBatchId } from '../dist/certificate-role.policy.js';
const require=createRequire(import.meta.url),pdf=require('../dist/presence-certificate-pdf.js');
const id='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const event={id:'event-a',organizationId:'org-a',name:'Congresso original',endDate:null};
const input={enabled:true,releaseMode:'manual',releaseDays:0,hours:8,title:'Certificado',body:'{NOME}',expectedRevision:0};
function fixture(){
 const batches=[],certs=[],audits=[],queries=[];
 const setting={...input,backBody:'**Original {NOME}**: {CARGA_HORARIA} h — {PAPEL}',revision:1};
 const subject={reservationId:null,personId:'person-a',activityId:null,submissionId:null,displayName:'Ana',subjectLabel:'Convidada',paperRole:'Convidada'};
 let denied=false;
 const scope=where=>{queries.push(where);assert.equal(where.organizationId,event.organizationId);assert.equal(where.eventId,event.id);};
 const db={event:{findUnique:async()=>event},eventCertificateRoleSetting:{findFirst:async()=>setting},
 eventRoleCertificateBatch:{
  findFirst:async({where})=>{scope(where);return batches.find(b=>b.id===where.id&&b.role===where.role)??null;},
  findMany:async({where,take})=>{scope(where);assert.equal(take,20);return batches.filter(b=>b.role===where.role);},
  create:async({data})=>{assert.ok(!batches.some(b=>b.id===data.id));const b={...data,createdAt:new Date('2026-10-26T03:00:00Z')};batches.push(b);return b;},
  update:async({where,data})=>{scope(where);Object.assign(batches.find(b=>b.id===where.id),data);},
 },eventRoleCertificate:{
  findFirst:async()=>certs[0]??null,
  findUnique:async()=>({...certs[0],event:{name:'Nome alterado'}}),
  findMany:async({where,take})=>{scope(where);assert.equal(take,41);return certs.filter(c=>c.batchId===where.batchId&&c.role===where.role);},
  create:async({data})=>{const c={...data,id:'cert-a',issuedAt:new Date('2026-10-26T03:00:00Z')};certs.push(c);return c;},
 },auditLog:{create:async({data})=>{audits.push(data);}},
 $transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');const before=[batches.length,certs.length,audits.length];try{return await fn(db);}catch(e){batches.length=before[0];certs.length=before[1];audits.length=before[2];throw e;}},
 };
 const service=new CertificateRoleService(db,{requireRole:async()=>{if(denied)throw Error('Acesso negado');}});
 service.subjects=async()=>({subjects:certs.length?[]:[subject],skipped:0,truncated:false});
 return{service,setting,certs,batches,audits,db,get denied(){return denied;},set denied(v){denied=v;}};
}
test('verso valida tags/formatação de cada papel e omissão preserva contrato antigo',()=>{
 for(const role of CERTIFICATE_ROLES){
  assert.equal(normalizeRoleSetting(role,input).back,undefined);
  assert.equal(normalizeRoleSetting(role,{...input,back:null}).back,null);
  assert.equal(normalizeRoleSetting(role,{...input,back:''}).back,null);
  assert.equal(normalizeRoleSetting(role,{...input,back:'**{NOME}** — {CARGA_HORARIA} h'}).back,'**{NOME}** — {CARGA_HORARIA} h');
  for(const back of ['<script>x</script>','{NAO_EXISTE}','x'.repeat(4001),false])assert.throws(()=>normalizeRoleSetting(role,{...input,back}));
  const v=publicRoleCertificateView({role,eventName:'Congresso',displayName:'Ana',hours:8,issuedAt:'2026-10-26T03:00:00Z',code:'a'.repeat(32),title:'Título',body:'Corpo',back:'{NOME} — {CARGA_HORARIA} h',subjectLabel:'Trabalho',paperRole:null});assert.equal(v.back,'Ana — 8 h');
 }
 for(const value of [undefined,'../x','x','AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'])assert.throws(()=>roleBatchId(value));
});
test('pedido recuperado mantém lote, auditoria e snapshot original, mesmo com configuração desligada',async()=>{
 const h=fixture(),first=await h.service.issueEligible('editor',event.id,'guest',{batchId:id});
 assert.equal(first.batchId,id);assert.equal(first.created,1);assert.equal(h.batches.length,1);assert.equal(h.audits.length,2);
 const before=await h.service.publicView(h.certs[0].code),packageBefore=await h.service.batchPdf('editor',event.id,'guest',id);
 h.setting.backBody='Modelo novo';h.setting.title='Novo';h.setting.hours=24;h.setting.enabled=false;
 assert.deepEqual(await h.service.issueEligible('editor',event.id,'guest',{batchId:id}),first);
 assert.deepEqual(await h.service.publicView(h.certs[0].code),before);
 assert.deepEqual((await h.service.batchPdf('editor',event.id,'guest',id)).bytes,packageBefore.bytes);
 assert.match(before.back,/Original Ana.*8 h/);assert.equal(h.certs[0].snapshotBackBody,'**Original {NOME}**: {CARGA_HORARIA} h — {PAPEL}');
 assert.equal(h.audits.length,2);assert.doesNotMatch(JSON.stringify(h.audits),/Original|Ana/);
 await assert.rejects(h.service.issueEligible('editor',event.id,'guest',{batchId:second}),/liberado/);
});
test('lote vazio é persistido, recuperável e não gera PDF vazio',async()=>{
 const h=fixture();h.service.subjects=async()=>({subjects:[],skipped:2,truncated:false});
 const first=await h.service.issueEligible('editor',event.id,'guest',{batchId:id});assert.equal(first.created,0);assert.equal(first.skipped,2);
 h.service.subjects=async()=>{throw Error('não deve selecionar novamente');};
 assert.deepEqual(await h.service.issueEligible('editor',event.id,'guest',{batchId:id}),first);
 await assert.rejects(h.service.batchPdf('editor',event.id,'guest',id),/não emitiu/);
});
test('pacote exige ACL, papel, lote exato e retrato completo; não trunca silenciosamente',async()=>{
 const h=fixture();await h.service.issueEligible('editor',event.id,'guest',{batchId:id});
 assert.equal((await h.service.listBatches('editor',event.id,'guest'))[0].id,id);
 await assert.rejects(h.service.batchPdf('editor',event.id,'reviewer',id),/não encontrado/);
 await assert.rejects(h.service.batchPdf('editor',event.id,'guest',second),/não encontrado/);
 h.denied=true;
 await assert.rejects(h.service.issueEligible('editor',event.id,'guest',{batchId:id}),/Acesso negado/);
 await assert.rejects(h.service.batchPdf('editor',event.id,'guest',id),/Acesso negado/);
 await assert.rejects(h.service.listBatches('editor',event.id,'guest'),/Acesso negado/);
 h.denied=false;h.certs[0].snapshotBody=null;
 await assert.rejects(h.service.batchPdf('editor',event.id,'guest',id),/retrato completo/);
 h.certs[0].snapshotBody='Corpo';h.batches[0].issuedCount=41;
 await assert.rejects(h.service.batchPdf('editor',event.id,'guest',id),/retrato completo/);
});
test('falha antes do commit desfaz pacote e auditoria; modelo sem verso permanece sem verso',async()=>{
 const h=fixture();h.db.eventRoleCertificate.create=async()=>{throw Error('Falha de gravação');};
 await assert.rejects(h.service.issueEligible('editor',event.id,'guest',{batchId:id}),/Falha/);
 assert.equal(h.batches.length,0);assert.equal(h.audits.length,0);
 const old=fixture();old.setting.backBody=null;await old.service.issueEligible('editor',event.id,'guest',{batchId:id});old.setting.backBody='Novo verso';
 assert.equal((await old.service.publicView(old.certs[0].code)).back,null);
 old.certs[0].snapshotVersion=null;old.certs[0].snapshotBackBody='Verso inválido legado';assert.equal((await old.service.publicView(old.certs[0].code)).back,null);
});
test('replay preserva também contagem de certificados encontrados entre seleção e transação',async()=>{
 const h=fixture();h.db.eventRoleCertificate.findFirst=async()=>({code:'a'.repeat(32),hours:8,issuedAt:new Date(),subjectLabel:'Convidada'});
 const first=await h.service.issueEligible('editor',event.id,'guest',{batchId:id});assert.equal(first.created,0);assert.equal(first.alreadyIssued,1);
 assert.deepEqual(await h.service.issueEligible('editor',event.id,'guest',{batchId:id}),first);
});
