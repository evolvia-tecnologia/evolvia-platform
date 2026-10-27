import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificReviewDistributionService } from '../dist/scientific-review-distribution.service.js';
function fixture(count, readyAt=count) {
 const rows=Array.from({length:count},(_,i)=>({id:String(i+1).padStart(6,'0'),title:'Trabalho',status:'UNDER_REVIEW',currentVersion:1,versions:[{id:`v${i+1}`,versionNumber:1}],authors:[],ownerReservation:null,reviewAssignments:i+1===readyAt?[]:[{reviewerPersonId:'r',versionId:`v${i+1}`,status:'ASSIGNED'}]}));
 let reads=0;
 const db={scientificReviewAssignment:{groupBy:async()=>[]},event:{findUnique:async()=>({id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'})},scientificPerson:{findMany:async()=>[{id:'r',name:'Avaliador',email:'r@example.test'}]},scientificSubmissionConfig:{findUnique:async()=>({reviewersPerSubmission:1})},scientificSubmission:{findMany:async({where,take})=>{reads++;assert.equal(where.eventId,'e');assert.equal(where.organizationId,'o');return rows.filter(r=>!where.id||r.id>where.id.gt).slice(0,take);}}};
 const service=new ScientificReviewDistributionService(db,{requireRole:async()=>{}});
 return {service,get reads(){return reads;}};
}

test('carga agregada usa somente organização/evento, avaliadores ativos e atribuições não canceladas',async()=>{
 let counted=false;
 const row={id:'s',title:'Trabalho',status:'SUBMITTED',currentVersion:1,versions:[{id:'v',versionNumber:1}],authors:[],ownerReservation:null,reviewAssignments:[]};
 const db={event:{findUnique:async()=>({id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'})},
 scientificPerson:{findMany:async()=>['a','b'].map(id=>({id,name:id,email:`${id}@evento.test`}))},
 scientificSubmissionConfig:{findUnique:async()=>({reviewersPerSubmission:1})},
 scientificSubmission:{findMany:async()=>[row]},
 scientificReviewAssignment:{groupBy:async(query)=>{counted=true;assert.deepEqual(query.where,{eventId:'e',organizationId:'o',status:{not:'CANCELLED'},reviewerPersonId:{in:['a','b']}});assert.deepEqual(query.by,['reviewerPersonId']);return[{reviewerPersonId:'a',_count:{_all:7}}];}}};
 const service=new ScientificReviewDistributionService(db,{requireRole:async()=>{}});
 const result=await service.preview('u','e');assert.equal(counted,true);assert.equal(result.suggestions[0].reviewerPersonId,'b');assert.ok(!JSON.stringify(result).includes('assignmentCount'));
});

test('plano revalidado com trabalho fora dos locks recusa antes de gravar',async()=>{
 const event={id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'};
 let writes=0,loads=0;
 const tx={$queryRaw:async()=>[event],scientificReviewAssignment:{create:async()=>{writes++;}},auditLog:{create:async()=>{writes++;}}};
 const service=new ScientificReviewDistributionService({event:{findUnique:async()=>event},$transaction:async(fn)=>fn(tx)},{requireRole:async()=>{}});
 service.load=async()=>({works:[],reviewers:[],plan:{plans:[{submissionId:++loads===1?'locked':'unlocked',versionId:'v',reviewerPersonId:'r'}],pending:false,cap:1}});
 await assert.rejects(service.apply('u','e'),e=>e.getStatus?.()===409);assert.equal(writes,0);assert.equal(loads,2);
});
test('trabalho elegível depois de 480 já distribuídos não desaparece',async()=>{
 const h=fixture(481);const result=await h.service.preview('u','e');
 assert.equal(result.suggestions.length,1);assert.equal(result.suggestions[0].submissionId,'000481');assert.equal(result.pending,false);assert.equal(h.reads,7);
});
test('limite de leitura recusa resultado parcial em vez de declarar vazio',async()=>{
 const h=fixture(5001);await assert.rejects(h.service.preview('u','e'),/5000/);assert.ok(h.reads<=63);
});
test('fim exato de página e janela vazia não inventam pendência',async()=>{
 for(const count of [0,80,400]) {const h=fixture(count,0);const result=await h.service.preview('u','e');assert.equal(result.suggestions.length,0);assert.equal(result.pending,false);}
});
test('volume informado pelo PO: último elegível em eventos de 500, 3000 e 5000 trabalhos',async()=>{
 for(const count of [500,3000,5000]) {
  const h=fixture(count);const result=await h.service.preview('u','e');
  assert.equal(result.suggestions.length,1,`evento com ${count}`);
  assert.equal(result.suggestions[0].submissionId,String(count).padStart(6,'0'));
  assert.equal(result.pending,false);
  assert.equal(h.reads,Math.ceil(count/80));
 }
});
test('3000 trabalhos integralmente distribuídos retornam vazio sem pendência falsa',async()=>{
 const h=fixture(3000,0);const result=await h.service.preview('u','e');
 assert.deepEqual(result.suggestions,[]);assert.equal(result.pending,false);assert.equal(h.reads,38);
});
test('apply verrouille le périmètre avant toute lecture et exige Serializable',async()=>{
 let locked=false;let calls=0;
 const event={id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'};
 const tx={$queryRaw:async(sql)=>{assert.ok(sql.values.includes('e'));assert.ok(sql.values.includes('o'));locked=true;return[event];},scientificPerson:{findMany:async()=>{assert.ok(locked);calls++;return[];}},scientificSubmissionConfig:{findUnique:async()=>null},scientificSubmission:{findMany:async()=>[]}};
 const db={scientificReviewAssignment:{groupBy:async()=>[]},event:{findUnique:async()=>event},$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');return fn(tx);}};
 const service=new ScientificReviewDistributionService(db,{requireRole:async()=>{}});
 assert.deepEqual(await service.apply('u','e'),{assignedCount:0,pending:false,cap:null});assert.equal(calls,1);
});

test('serialização SQL bruta 40001 vira409 sem mascarar outros erros',async()=>{
 const {Prisma}=await import('@prisma/client');
 for(const sqlstate of ['40001','42P01']) {
  const error=new Prisma.PrismaClientKnownRequestError('teste',{code:'P2010',clientVersion:'test',meta:{code:sqlstate}});
  const db={scientificReviewAssignment:{groupBy:async()=>[]},event:{findUnique:async()=>({id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'})},$transaction:async()=>{throw error;}};
  const service=new ScientificReviewDistributionService(db,{requireRole:async()=>{}});
  await assert.rejects(service.apply('u','e'),e=>sqlstate==='40001'?e.getStatus?.()===409:e===error);
 }
});

test('lock do lote ordena registros no SQL antes de FOR UPDATE',async()=>{
 const event={id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'};
 const stop=new Error('lock inspecionado');let locks=0;
 const rows=['b','a'].map(id=>({id,title:id,status:'SUBMITTED',currentVersion:1,versions:[{id:`v${id}`,versionNumber:1}],authors:[],ownerReservation:null,reviewAssignments:[]}));
 const tx={
  $queryRaw:async(sql)=>{locks++;if(locks===2){assert.match(sql.sql,/ORDER BY "id" ASC\s+FOR UPDATE/);assert.deepEqual(sql.values,['a','b','e','o']);throw stop;}return[event];},
  scientificReviewAssignment:{groupBy:async()=>[]},
  scientificPerson:{findMany:async()=>[{id:'r',name:'R',email:'r@example.test'}]},
  scientificSubmissionConfig:{findUnique:async()=>({reviewersPerSubmission:1})},
  scientificSubmission:{findMany:async()=>rows},
 };
 const db={scientificReviewAssignment:{groupBy:async()=>[]},event:{findUnique:async()=>event},$transaction:async(fn)=>fn(tx)};
 const service=new ScientificReviewDistributionService(db,{requireRole:async()=>{}});
 await assert.rejects(service.apply('u','e'),e=>e===stop);assert.equal(locks,2);
});

test('cancelamento após autorização e evento ausente recusam antes de carregar o lote',async()=>{
 for(const locked of [[],[{status:'CANCELLED',profileCode:'SCIENTIFIC_EVENT'}],[{status:'ACTIVE',profileCode:'CORPORATE_EVENT'}]]) {
  let reads=0;
  const tx={$queryRaw:async(sql)=>{assert.ok(sql.values.includes('e'));assert.ok(sql.values.includes('o'));return locked;},scientificPerson:{findMany:async()=>{reads++;throw new Error('não pode carregar');}}};
  const db={scientificReviewAssignment:{groupBy:async()=>[]},event:{findUnique:async()=>({id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'})},$transaction:async(fn)=>fn(tx)};
  const service=new ScientificReviewDistributionService(db,{requireRole:async()=>{}});
  await assert.rejects(service.apply('u','e'),e=>e.getStatus?.()===(!locked.length?404:locked[0].status==='CANCELLED'?409:400));
  assert.equal(reads,0);
 }
});

