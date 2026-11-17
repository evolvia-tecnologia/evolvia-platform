import assert from 'node:assert/strict';
import test from 'node:test';
import { ExhibitorService } from '../dist/exhibitor.service.js';
import { AuthorizationService } from '../dist/authorization.service.js';

const event = { id: 'event-a', organizationId: 'org-a', capabilities: [{ id: 'cap' }] };
function fixture(role = 'OWNER') {
  const prisma = {
    event: { findUnique: async () => event },
    organizationMembership: { findUnique: async () => ({ role, status: 'ACTIVE' }) },
  };
  return { prisma, service: new ExhibitorService(prisma, new AuthorizationService(prisma)) };
}
function scope(where, company = false) {
  assert.equal(where.eventId, 'event-a');
  assert.equal(where.organizationId, 'org-a');
  if (company) assert.equal(where.companyId, 'company-a');
}
test('CAEX search paginates beyond the original home cut and keeps organization/event in every search', async () => {
  const { prisma, service } = fixture();
  prisma.eventExhibitorCompany = { findMany: async (query) => {
    scope(query.where); assert.equal(query.where.kind, 'PROVIDER');
    assert.equal(query.skip, 550); assert.equal(query.take, 51);
    assert.equal(query.where.OR[0].legalName.contains, 'Mitte');
    assert.equal(query.select.document, undefined);
    return Array.from({ length: 51 }, (_, i) => ({ id: String(i), tradeName: 'Empresa' }));
  } };
  const result = await service.caexCompanies('user', 'event-a', ' Mitte ', 'PROVIDER', '11');
  assert.equal(result.items.length, 50); assert.equal(result.hasMore, true);
});
test('CAEX rejects invalid pages, arrays, search lengths and kinds before querying companies', async () => {
  const { service } = fixture();
  for (const args of [['q','OTHER','0'], ['q','EXHIBITOR','-1'], ['q','EXHIBITOR','1.5'],
    ['q','EXHIBITOR','100000'], ['x'.repeat(121),'EXHIBITOR','0'], [['q'],'EXHIBITOR','0']]) {
    await assert.rejects(service.caexCompanies('user', 'event-a', ...args), (e) => e.getStatus() === 400);
  }
});
test('CAEX refuses operator/viewer access before consulting companies', async () => {
  for (const role of ['OPERATOR', 'VIEWER']) {
    const { service } = fixture(role);
    await assert.rejects(service.caexCompanies('user', 'event-a'), (e) => e.getStatus() === 404);
    await assert.rejects(service.caexCompany('user', 'event-a', 'company-a'), (e) => e.getStatus() === 404);
  }
});
test('field search uses only allowlisted columns and does not expand the returned personal data', async () => {
  const { prisma, service } = fixture();
  let last;
  prisma.eventExhibitorCompany = { findMany: async (query) => { scope(query.where); last = query; return []; } };
  for (const [field, columns] of [
    ['COMPANY',['legalName','tradeName']], ['CONTACT',['contactName']], ['EMAIL',['loginEmail','contactEmail']],
    ['DOCUMENT',['document']], ['BOOTH',['booth']], ['CITY',['city']], ['STATE',['state']],
  ]) {
    await service.caexCompanies('user','event-a','Mitte','EXHIBITOR','0',field);
    assert.deepEqual(last.where.OR.map((clause) => Object.keys(clause)[0]), columns);
    assert.equal(last.select.contactEmail, undefined); assert.equal(last.select.loginEmail, undefined);
  }
  for (const field of ['__proto__','constructor','password','tradeName', ['EMAIL']]) {
    await assert.rejects(service.caexCompanies('user','event-a','q','EXHIBITOR','0',field), (e) => e.getStatus() === 400);
  }
});
test('foreign company is refused without any credential/form query', async () => {
  const { prisma, service } = fixture();
  prisma.eventExhibitorCompany = { findFirst: async ({ where }) => { scope(where); assert.equal(where.id, 'foreign'); return null; } };
  await assert.rejects(service.caexCompany('user','event-a','foreign'), (e) => e.getStatus() === 404);
});
test('company profile scopes credentials, visits and orders; independent pages include inactive forms without inventing acceptance/payment', async () => {
  const { prisma, service } = fixture();
  prisma.eventExhibitorCompany = { findFirst: async ({ where, select }) => {
    scope(where); assert.equal(select.document, undefined);
    return { id: 'company-a', kind: 'EXHIBITOR', tradeName: 'Mitte' };
  } };
  prisma.eventExhibitorCredential = {
    findMany: async (query) => {
      scope(query.where, true); assert.equal(query.skip, 200); assert.equal(query.take, 101);
      assert.equal(query.select.document, undefined);
      return Array.from({ length: 101 }, (_, i) => ({ id: String(i), printedAt: null, credentialedAt: null }));
    },
    count: async ({ where }) => { scope(where, true); return 301; },
    groupBy: async ({ where }) => { scope(where, true); return [{ kind: 'EXHIBITOR', _count: { _all: 301 } }]; },
  };
  prisma.eventExhibitorForm = { findMany: async (query) => {
    scope(query.where); assert.equal(query.where.active, undefined);
    assert.deepEqual(query.where.audience.in, ['EXHIBITOR', 'BOTH']);
    assert.equal(query.skip, 50); assert.equal(query.take, 51);
    scope(query.select.visits.where, true);
    scope(query.select.products.select.orders.where, true);
    return [{ id:'form', kind:'DOCUMENT', active:false, deadline:null, visits:[{visitedAt:new Date('2026-10-24T00:00:00Z')}], products:[] }];
  } };
  const result = await service.caexCompany('user','event-a','company-a','2','1');
  assert.equal(result.credentials.length, 100); assert.equal(result.hasMore, true); assert.equal(result.total,301);
  assert.equal(result.forms[0].visitedAt, '2026-10-24T00:00:00.000Z'); assert.equal(result.forms[0].active,false);
  assert.equal(result.forms[0].accepted, undefined); assert.equal(result.forms[0].paid,undefined);
});
test('quotas use all company credentials rather than the displayed credential page', async () => {
  const { prisma, service } = fixture();
  prisma.eventExhibitorCompany = { findFirst: async () => ({
    id:'company-a',kind:'EXHIBITOR',quotaExhibitor:30,quotaAssembler:0,quotaService:10,
  }) };
  prisma.eventExhibitorCredential = {
    findMany:async()=>[], count:async()=>34,
    groupBy:async()=>[{kind:'EXHIBITOR',_count:{_all:31}},{kind:'SERVICE',_count:{_all:3}}],
  };
  prisma.eventExhibitorForm = { findMany:async()=>[] };
  const result = await service.caexCompany('user','event-a','company-a','1');
  assert.deepEqual(result.quotas,[
    {kind:'EXHIBITOR',limit:30,used:31,available:0,exceeded:true},
    {kind:'ASSEMBLER',limit:0,used:0,available:0,exceeded:false},
    {kind:'SERVICE',limit:10,used:3,available:7,exceeded:false},
  ]);
});
test('company orders paginate with scoped ownership and use the purchase price rather than catalog price', async () => {
  const { prisma, service } = fixture();
  prisma.eventExhibitorCompany = { findFirst: async ({where,select})=>{
    scope(where);assert.equal(where.id,'company-a');assert.deepEqual(select,{id:true});return {id:'company-a'};
  } };
  prisma.eventExhibitorOrder = { findMany: async (query)=>{
    scope(query.where,true);assert.equal(query.skip,100);assert.equal(query.take,51);
    assert.equal(query.select.product.select.priceCents,undefined);
    return Array.from({length:51},(_,index)=>({id:String(index),quantity:2,priceCents:1500,status:'CONFIRMED',
      createdAt:new Date('2026-10-24T00:00:00Z'),product:{title:'Serviço',unit:'un',priceCents:9000,form:{title:'Solicitação'}}}));
  } };
  const result=await service.caexCompanyOrders('user','event-a','company-a','2');
  assert.equal(result.hasMore,true);assert.equal(result.items.length,50);
  assert.equal(result.items[0].unitPriceCents,1500);assert.equal(result.items[0].totalCents,3000);
  assert.equal(result.items[0].paid,undefined);assert.equal(result.items[0].status,'CONFIRMED');
});
test('company orders reject foreign companies and unauthorized roles without querying orders', async () => {
  const { prisma,service }=fixture();
  prisma.eventExhibitorCompany={findFirst:async()=>null};
  await assert.rejects(service.caexCompanyOrders('user','event-a','foreign'),e=>e.getStatus()===404);
  for(const role of ['OPERATOR','VIEWER']){
    await assert.rejects(fixture(role).service.caexCompanyOrders('user','event-a','company-a'),e=>e.getStatus()===404);
  }
});
