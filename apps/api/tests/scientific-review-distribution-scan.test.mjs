import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificReviewDistributionService } from '../dist/scientific-review-distribution.service.js';
function fixture(count, readyAt=count) {
 const rows=Array.from({length:count},(_,i)=>({id:String(i+1).padStart(6,'0'),title:'Trabalho',status:'UNDER_REVIEW',currentVersion:1,versions:[{id:`v${i+1}`,versionNumber:1}],authors:[],ownerReservation:null,reviewAssignments:i+1===readyAt?[]:[{reviewerPersonId:'r',versionId:`v${i+1}`,status:'ASSIGNED'}]}));
 let reads=0;
 const db={event:{findUnique:async()=>({id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'})},scientificPerson:{findMany:async()=>[{id:'r',name:'Avaliador',email:'r@example.test'}]},scientificSubmissionConfig:{findUnique:async()=>({reviewersPerSubmission:1})},scientificSubmission:{findMany:async({where,take})=>{reads++;assert.equal(where.eventId,'e');assert.equal(where.organizationId,'o');return rows.filter(r=>!where.id||r.id>where.id.gt).slice(0,take);}}};
 const service=new ScientificReviewDistributionService(db,{requireRole:async()=>{}});
 return {service,get reads(){return reads;}};
}
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
test('apply trava o escopo antes da leitura e exige Serializable',async()=>{
 let locked=false;let calls=0;
 const event={id:'e',organizationId:'o',profileCode:'SCIENTIFIC_EVENT',status:'ACTIVE'};
 const tx={$queryRaw:async(sql)=>{assert.ok(sql.values.includes('e'));assert.ok(sql.values.includes('o'));locked=true;},scientificPerson:{findMany:async()=>{assert.ok(locked);calls++;return[];}},scientificSubmissionConfig:{findUnique:async()=>null},scientificSubmission:{findMany:async()=>[]}};
 const db={event:{findUnique:async()=>event},$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');return fn(tx);}};
 const service=new ScientificReviewDistributionService(db,{requireRole:async()=>{}});
 assert.deepEqual(await service.apply('u','e'),{assignedCount:0,pending:false,cap:null});assert.equal(calls,1);
});
