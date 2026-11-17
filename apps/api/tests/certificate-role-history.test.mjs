import assert from 'node:assert/strict';
import test from 'node:test';
import {CertificateRoleService} from '../dist/certificate-role.service.js';

const event={id:'event-a',organizationId:'org-a'};
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
function fixture(){
 const rows=Array.from({length:45},(_,i)=>({id:id(i+1),organizationId:event.organizationId,eventId:event.id,role:'guest',issuedCount:0,skippedCount:0,truncated:false,createdAt:new Date('2026-10-26T05:00:00Z')}));
 const queries=[];let denied=false;
 const inScope=(row,where)=>row.organizationId===where.organizationId&&row.eventId===where.eventId&&row.role===where.role;
 const db={event:{findUnique:async()=>event},eventRoleCertificateBatch:{
  findFirst:async({where})=>{queries.push(where);return rows.find(row=>inScope(row,where)&&row.id===where.id)??null;},
  findMany:async({where,orderBy,take,select})=>{
   queries.push(where);assert.equal(where.eventId,event.id);assert.equal(where.organizationId,event.organizationId);assert.equal(take,20);
   assert.deepEqual(orderBy,[{createdAt:'desc'},{id:'desc'}]);
   return rows.filter(row=>inScope(row,where)&&(!where.OR||row.createdAt<where.OR[0].createdAt.lt||(+row.createdAt===+where.OR[1].createdAt&&row.id<where.OR[1].id.lt)))
    .sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id)).slice(0,take).map(row=>Object.fromEntries(Object.keys(select).map(k=>[k,row[k]])));
  },
 }};
 const service=new CertificateRoleService(db,{requireRole:async()=>{if(denied)throw Error('Acesso negado');}});
 return{rows,service,queries,set denied(v){denied=v;}};
}
test('histórico alcança mais20 lotes com empate de data sem pular/duplicar após inserção nova',async()=>{
 const h=fixture(),first=await h.service.listBatches('reader',event.id,'guest');assert.equal(first.length,20);
 h.rows.push({...h.rows[0],id:id(99),createdAt:new Date('2026-10-27T05:00:00Z')});
 const second=await h.service.listBatches('reader',event.id,'guest',first.at(-1).id);
 const third=await h.service.listBatches('reader',event.id,'guest',second.at(-1).id);
 const all=[...first,...second,...third];assert.equal(third.length,5);assert.deepEqual(all.map(r=>r.id),Array.from({length:45},(_,i)=>id(45-i)));
 assert.equal(new Set(all.map(r=>r.id)).size,45);
 assert.deepEqual(Object.keys(all[0]).sort(),['createdAt','id','issuedCount','role','skippedCount','truncated']);
 assert.deepEqual(await h.service.listBatches('reader',event.id,'guest',third.at(-1).id),[]);
});
test('cursor exige UUID e escopo exato; ACL vem antes da consulta de histórico',async()=>{
 const h=fixture();
 for(const value of ['',null,[],[id(1)],'../x'])await assert.rejects(h.service.listBatches('reader',event.id,'guest',value));
 for(const scope of [{role:'reviewer'},{eventId:'event-b'},{organizationId:'org-b'}]){
  h.rows.push({...h.rows[0],id:id(90),...scope});
  await assert.rejects(h.service.listBatches('reader',event.id,'guest',id(90)),/não encontrado/);h.rows.pop();
 }
 await assert.rejects(h.service.listBatches('reader',event.id,'guest',id(100)),/não encontrado/);
 h.denied=true;const before=h.queries.length;
 await assert.rejects(h.service.listBatches('reader',event.id,'guest',id(1)),/Acesso negado/);assert.equal(h.queries.length,before);
});
