import assert from 'node:assert/strict';
import test from 'node:test';
import {PresenceCertificateService} from '../dist/presence-certificate.service.js';

const event={id:'event-a',organizationId:'org-a'};
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
function fixture(){
 const rows=Array.from({length:205},(_,i)=>({id:id(i+1),organizationId:event.organizationId,eventId:event.id,issuedCount:1,hours:8,createdAt:new Date('2026-10-26T05:00:00Z')}));
 const queries=[];let denied=false;
 const inScope=(row,where)=>row.organizationId===where.organizationId&&row.eventId===where.eventId&&row.issuedCount>0;
 const db={event:{findUnique:async()=>event},eventCertificateBatch:{
  findFirst:async({where})=>{queries.push(where);return rows.find(row=>inScope(row,where)&&row.id===where.id)??null;},
  findMany:async({where,orderBy,take,select})=>{
   queries.push(where);assert.equal(where.eventId,event.id);assert.equal(where.organizationId,event.organizationId);assert.equal(take,100);
   assert.deepEqual(orderBy,[{createdAt:'desc'},{id:'desc'}]);
   return rows.filter(row=>inScope(row,where)&&(!where.OR||row.createdAt<where.OR[0].createdAt.lt||(+row.createdAt===+where.OR[1].createdAt&&row.id<where.OR[1].id.lt)))
    .sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id)).slice(0,take).map(row=>Object.fromEntries(Object.keys(select).map(k=>[k,row[k]])));
  },
 }};
 const service=new PresenceCertificateService(db,{requireRole:async()=>{if(denied)throw Error('Acesso negado');}});
 return{rows,service,queries,set denied(v){denied=v;}};
}
test('histórico alcança mais100 lotes com empate de data sem pular/duplicar após inserção nova',async()=>{
 const h=fixture(),first=await h.service.listBatches('reader',event.id);assert.equal(first.length,100);
 h.rows.push({...h.rows[0],id:id(999),createdAt:new Date('2026-10-27T05:00:00Z')});
 const second=await h.service.listBatches('reader',event.id,first.at(-1).id);
 const third=await h.service.listBatches('reader',event.id,second.at(-1).id);
 const all=[...first,...second,...third];assert.equal(third.length,5);assert.deepEqual(all.map(r=>r.id),Array.from({length:205},(_,i)=>id(205-i)));
 assert.equal(new Set(all.map(r=>r.id)).size,205);
 assert.deepEqual(Object.keys(all[0]).sort(),['createdAt','hours','id','issuedCount']);
 assert.deepEqual(await h.service.listBatches('reader',event.id,third.at(-1).id),[]);
});
test('cursor exige UUID e escopo exato; ACL vem antes da consulta de histórico',async()=>{
 const h=fixture();
 for(const value of ['',null,[],[id(1)],'../x'])await assert.rejects(h.service.listBatches('reader',event.id,value));
 for(const scope of [{issuedCount:0},{eventId:'event-b'},{organizationId:'org-b'}]){
  h.rows.push({...h.rows[0],id:id(990),...scope});
  await assert.rejects(h.service.listBatches('reader',event.id,id(990)),/não encontrado/);h.rows.pop();
 }
 await assert.rejects(h.service.listBatches('reader',event.id,id(1000)),/não encontrado/);
 h.denied=true;const before=h.queries.length;
 await assert.rejects(h.service.listBatches('reader',event.id,id(1)),/Acesso negado/);assert.equal(h.queries.length,before);
});
test('data mais antiga precede o desempate por id e pacotes vazios não entram',async()=>{
 const h=fixture();
 h.rows.splice(0,h.rows.length,
  {id:id(200),eventId:event.id,organizationId:event.organizationId,issuedCount:1,hours:null,createdAt:new Date('2026-10-25T05:00:00Z')},
  {id:id(1),eventId:event.id,organizationId:event.organizationId,issuedCount:1,hours:2,createdAt:new Date('2026-10-26T05:00:00Z')});
 h.rows.push({...h.rows[0],id:id(300),issuedCount:0});
 const rows=await h.service.listBatches('reader',event.id,id(1));
 assert.deepEqual(rows.map(row=>row.id),[id(200)]);assert.equal(rows[0].hours,null);
});
