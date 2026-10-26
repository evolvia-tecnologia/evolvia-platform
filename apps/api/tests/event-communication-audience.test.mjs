import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationAudienceInput, uniqueCommunicationContacts } from '../dist/event-communication-audience.policy.js';
import { EventCommunicationAudienceService } from '../dist/event-communication-audience.service.js';
function harness(rows=[]) {
  const queries=[];let allowed=true, categoryCount=1;
  const scope={eventId:'evt-a',organizationId:'org-a'};
  const prisma={event:{findUnique:async()=>({id:'evt-a',organizationId:'org-a'})},eventRegistrationCategory:{count:async({where})=>{assert.equal(where.eventId,scope.eventId);assert.equal(where.organizationId,scope.organizationId);return categoryCount;},findMany:async({where})=>{assert.deepEqual(where,scope);return []; }},eventRegistrationReservation:{findMany:async(query)=>{queries.push(query);assert.deepEqual(query.where.AND[0],scope);assert.deepEqual(query.where.AND[1],{status:'CONFIRMED'});assert.deepEqual(query.select,{registrationData:true});return rows;}}};
  const service=new EventCommunicationAudienceService(prisma,{requireRole:async(_user,org,roles)=>{assert.equal(org,'org-a');assert.ok(!roles.includes('OPERATOR'));if(!allowed)throw Error('forbidden');}});
  return {service,queries,deny:()=>allowed=false,crossCategory:()=>categoryCount=0};
}
test('filtros têm defaults explícitos, categorias únicas e limites',()=>{
  assert.deepEqual(communicationAudienceInput({}),{categoryIds:[],payment:'ALL',page:1});
  assert.deepEqual(communicationAudienceInput({categoryIds:['a','a']}),{categoryIds:['a'],payment:'ALL',page:1});
  for(const raw of [null,[],{organizationId:'org-b'},{payment:'CONFIRMED'},{categoryIds:['../x']},{categoryIds:Array(51).fill('a')},{page:0},{page:101},{page:'1'}]) assert.throws(()=>communicationAudienceInput(raw));
});
test('normaliza e-mails, agrupa duplicatas e informa contatos inválidos sem expor ficha',()=>{
  const result=uniqueCommunicationContacts([{registrationData:{email:' ANA@EXAMPLE.TEST ',full_name:'Ana',cpf:'secret'}},{registrationData:{email:'ana@example.test',full_name:'Duplicata'}},{registrationData:{}},{registrationData:{email:'a\n@b.test'}},{registrationData:{email:'a\u0000@b.test'}},{registrationData:{email:'b@example.test',full_name:'<Beto>'}}]);
  assert.equal(result.contacts.length,2);assert.equal(result.duplicates,1);assert.equal(result.missingEmail,3);assert.equal(result.contacts[1].name,'Beto');assert.doesNotMatch(JSON.stringify(result),/cpf|secret|Duplicata/);
});
test('PAID exige fato financeiro, data e valor positivo; categorias são OU em conjunto E',async()=>{
  const h=harness();await h.service.preview('u','evt-a',{payment:'PAID',categoryIds:['cat-a']});
  const q=h.queries[0];assert.deepEqual(q.where.AND[2],{checkout:{is:{eventId:'evt-a',organizationId:'org-a',status:'PAID',paidAt:{not:null},amountCents:{gt:0}}}});assert.deepEqual(q.where.AND[3],{categoryId:{in:['cat-a']}});
});
test('valor zero não é marcado como pagamento no checkout',async()=>{
  const h=harness();await h.service.preview('u','evt-a',{payment:'ZERO'});assert.deepEqual(h.queries[0].where.AND[2],{finalPriceCents:0});
});
test('categoria de outro evento recusa antes de consultar inscrições',async()=>{
  const h=harness();h.crossCategory();await assert.rejects(h.service.preview('u','evt-a',{categoryIds:['cat-b']}),/não pertence/);assert.equal(h.queries.length,0);
});
test('sem permissão não lista categorias ou destinatários',async()=>{
  const h=harness();h.deny();await assert.rejects(h.service.categories('u','evt-a'),/forbidden/);await assert.rejects(h.service.preview('u','evt-a',{}),/forbidden/);assert.equal(h.queries.length,0);
});
test('prévia pagina contatos únicos e reconcilia contagens sem enviar',async()=>{
  const rows=Array.from({length:55},(_,i)=>({registrationData:{email:`p${i}@example.test`,full_name:`Pessoa ${i}`}}));rows.push(rows[0],{registrationData:{}});const h=harness(rows);
  const result=await h.service.preview('u','evt-a',{page:2});assert.equal(result.items.length,5);assert.equal(result.total,55);assert.equal(result.matchedRegistrations,57);assert.equal(result.duplicates,1);assert.equal(result.missingEmail,1);assert.equal(result.sendingAvailable,false);assert.equal(h.queries[0].take,5001);
});
test('limite excedido falha de forma explícita sem lista truncada',async()=>{
  const h=harness(Array(5001).fill({registrationData:{email:'a@example.test'}}));await assert.rejects(h.service.preview('u','evt-a',{}),/Nenhuma lista parcial/);
});
