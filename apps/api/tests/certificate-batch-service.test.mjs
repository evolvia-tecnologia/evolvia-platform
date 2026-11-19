import assert from 'node:assert/strict';
import test from 'node:test';
import { PresenceCertificateService } from '../dist/presence-certificate.service.js';
import { normalizeCertificateBatch } from '../dist/presence-certificate.policy.js';
const command={requestId:'11111111-1111-4111-8111-111111111111',expectedRevision:3,afterId:null};
function fixture({rows=[{id:'r-a',registrationData:{full_name:'Ana Souza'}}],fresh,denied=false,enabled=true,revision=3}={}) {
  const batches=new Map(),certificates=[],audits=[],queries=[],locks=[];
  const setting={enabled,revision,hours:8,title:'Original {EVENTO}',body:'Participou {NOME}',backBody:'Carga {CARGA_HORARIA} h de {NOME}',artStorageKey:null,artMimeType:null,artAltText:null,event:{name:'Evento original'}};
  const db={
    event:{findUnique:async()=>({id:'event-a',organizationId:'org-a'})},
    $queryRaw:async(...args)=>{locks.push(args);return[];},
    eventCertificateSetting:{findFirst:async()=>({...setting})},
    eventRegistrationReservation:{
      findFirst:async({where})=>rows.find(r=>r.id===where.id)??null,
      findMany:async q=>{queries.push(q);assert.equal(q.where.eventId,'event-a');assert.equal(q.where.organizationId,'org-a');assert.equal(q.where.status,'CONFIRMED');assert.deepEqual(q.where.checkIn,{is:{reversedAt:null}});if(q.where.id?.in)return fresh??rows.filter(r=>q.where.id.in.includes(r.id));return rows.filter(r=>!q.where.id?.gt||r.id>q.where.id.gt).slice(0,q.take);}
    },
    eventCertificateBatch:{findFirst:async({where})=>batches.get(where.id),create:async({data})=>{const row={...data,createdAt:new Date('2026-10-25T12:00:00Z')};batches.set(data.id,row);return row;},findMany:async q=>{assert.equal(q.where.eventId,'event-a');assert.equal(q.where.organizationId,'org-a');assert.equal(q.take,100);return [...batches.values()].filter(row=>row.issuedCount>0).map(({id,issuedCount,hours,createdAt})=>({id,issuedCount,hours,createdAt}));}},
    eventCertificate:{count:async({where})=>certificates.filter(row=>!where.batchId||row.batchId===where.batchId).length,findMany:async({where})=>{assert.equal(where.eventId,'event-a');assert.equal(where.organizationId,'org-a');return certificates.filter(row=>!where.batchId||row.batchId===where.batchId).map(row=>({...row,event:{name:setting.event.name,certificateSetting:setting}}));},createMany:async({data})=>{certificates.push(...data.map(row=>({...row,issuedAt:new Date('2026-10-25T12:00:00Z')})));return{count:data.length};}},
    auditLog:{create:async({data})=>{audits.push(data);}},
    $transaction:async fn=>fn(db),
  };
  const service=new PresenceCertificateService(db,{requireRole:async()=>{if(denied)throw Object.assign(new Error('negado'),{status:403});}},{});
  return{service,batches,certificates,audits,queries,locks,setting};
}
test('lote congela horas/texto/verso, minimiza auditoria e repetição recupera mesmo resultado',async()=>{
  const h=fixture();const first=await h.service.issueBatch('editor','event-a',command);const again=await h.service.issueBatch('editor','event-a',command);
  assert.deepEqual(again,first);assert.equal(first.issuedCount,1);assert.equal(first.totalIssued,1);assert.equal(h.certificates.length,1);assert.equal(h.audits.length,1);
  assert.equal(h.certificates[0].snapshotBackBody,'Carga {CARGA_HORARIA} h de {NOME}');assert.equal(h.certificates[0].snapshotEventName,'Evento original');assert.equal(h.certificates[0].hours,8);
  assert.doesNotMatch(JSON.stringify(h.audits),/Ana Souza|registrationData|email|code/);assert.equal(h.locks.length,3);
  h.setting.enabled=false;assert.deepEqual(await h.service.issueBatch('editor','event-a',command),first);
  await assert.rejects(h.service.issueBatch('editor','event-a',{...command,expectedRevision:4}),{status:409});assert.equal(h.audits.length,1);
});
test('400 nomes inválidos não bloqueiam a próxima janela e lote vazio não audita',async()=>{
  const rows=Array.from({length:401},(_,i)=>({id:`r-${String(i).padStart(4,'0')}`,registrationData:{full_name:i<400?'<inválido>':'Bruno Lima'}}));const h=fixture({rows});
  const first=await h.service.issueBatch('editor','event-a',command);assert.equal(first.issuedCount,0);assert.equal(first.scannedCount,400);assert.equal(first.skippedCount,400);assert.equal(first.nextAfterId,'r-0399');assert.equal(h.audits.length,0);
  const next=await h.service.issueBatch('editor','event-a',{...command,requestId:'22222222-2222-4222-8222-222222222222',afterId:first.nextAfterId});assert.equal(next.issuedCount,1);assert.equal(next.pending,false);assert.equal(h.certificates[0].displayName,'Bruno Lima');
});
test('limite40 e confirmação/presença são conferidos novamente após locks',async()=>{
  const rows=Array.from({length:42},(_,i)=>({id:`r-${String(i).padStart(3,'0')}`,registrationData:{full_name:'Nome válido'}}));
  const h=fixture({rows});const result=await h.service.issueBatch('editor','event-a',command);assert.equal(result.issuedCount,40);assert.equal(result.nextAfterId,'r-039');assert.equal(result.pending,true);assert.equal(h.certificates.length,40);
  const reversed=fixture({rows,fresh:[]});const empty=await reversed.service.issueBatch('editor','event-a',command);assert.equal(empty.issuedCount,0);assert.equal(reversed.audits.length,0);assert.equal(reversed.certificates.length,0);
});
test('ACL, liberação, revisão e cursor alheio recusam sem certificados/auditoria',async()=>{
  for(const [opts,input,status]of [[{denied:true},command,403],[{enabled:false},command,403],[{revision:4},command,409],[{}, {...command,afterId:'foreign'},400]]){
    const h=fixture(opts);await assert.rejects(h.service.issueBatch('intruso','event-a',input),{status});assert.equal(h.certificates.length,0);assert.equal(h.audits.length,0);
  }
});
test('pedido exige UUID seguro, revisão e campos conhecidos',()=>{
  for(const value of [null,{}, {...command,organizationId:'foreign'},{...command,requestId:'x'},{...command,afterId:'../x'},{...command,expectedRevision:-1}])assert.throws(()=>normalizeCertificateBatch(value));
  assert.deepEqual(normalizeCertificateBatch(command),command);
});

test('pacote listado minimiza dados, PDF usa somente membros do pacote e chave alheia não devolve documentos',async()=>{
  const h=fixture();await h.service.issueBatch('editor','event-a',command);const packages=await h.service.listBatches('editor','event-a');assert.equal(packages.length,1);assert.deepEqual(Object.keys(packages[0]).sort(),['createdAt','hours','id','issuedCount']);
  const pdf=await h.service.batchPdf('editor','event-a',command.requestId);assert.equal(pdf.count,1);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');
  await assert.rejects(h.service.batchPdf('editor','event-a','22222222-2222-4222-8222-222222222222'),{status:404});assert.equal(h.certificates.length,1);
});
