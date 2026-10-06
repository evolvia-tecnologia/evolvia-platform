import assert from 'node:assert/strict';
import test from 'node:test';
import { PostEventReportAccumulator } from '../dist/post-event-report-policy.js';
const accumulator = () => new PostEventReportAccumulator([], new Map(), null, 'UTC', new Date('2026-10-06T00:00:00Z'));
const row = (values = {}) => ({ status:'CONFIRMED', expiresAt:null, categoryId:'a', category:{name:'Categoria A'}, finalPriceCents:1000, registrationData:{}, registrationFormVersion:null, checkIn:null, checkout:null, ...values });
test('pagamentos por categoria conciliam população e valores sem incluir reservas não confirmadas', () => {
  const a = accumulator();
  a.add(row({checkout:{status:'PAID',amountCents:900}}));
  a.add(row({finalPriceCents:0}));
  a.add(row({checkout:{status:'PAID_REVIEW',amountCents:1000}}));
  a.add(row({categoryId:'b',category:{name:'Categoria B'}}));
  a.add(row({status:'CANCELLED',checkout:{status:'PAID',amountCents:5000}}));
  a.add(row({status:'PENDING_PAYMENT'}));
  const report = a.finish();
  assert.deepEqual(report.payment.categories[0], {label:'Categoria A',confirmed:3,paid:1,exempt:1,review:1,unverified:0,receivedCents:900,confirmedPriceCents:2000});
  for (const key of ['paid','exempt','review','unverified','receivedCents','confirmedPriceCents']) assert.equal(report.payment.categories.reduce((sum,row)=>sum+row[key],0),report.payment[key]);
  assert.equal(report.payment.categories.reduce((sum,row)=>sum+row.confirmed,0),report.registration.confirmed);
  assert.equal(report.payment.receivedCents,900);
});
test('cardinalidade de categorias é limitada e a cauda preserva totais', () => {
  const a = accumulator();
  for (let i=0;i<230;i++) a.add(row({categoryId:'c'+i,category:{name:'Categoria '+i},checkout:{status:'PAID',amountCents:1000}}));
  const p = a.finish().payment;
  assert.equal(p.categories.length,201);
  assert.equal(p.categories.find(row=>row.label==='Outras categorias').confirmed,30);
  assert.equal(p.categories.reduce((sum,row)=>sum+row.receivedCents,0),230000);
  assert.deepEqual(accumulator().finish().payment.categories,[]);
});

test('categoria ausente preserva totais e identificação explícita nas duas distribuições', () => {
  const a=accumulator();a.add(row({category:null,checkout:{status:'PAID',amountCents:900}}));
  const report=a.finish();
  assert.equal(report.payment.categories[0].label,'Sem categoria');
  assert.equal(report.categories[0].label,'Sem categoria');
  assert.equal(report.payment.receivedCents,900);
  assert.equal(report.registration.confirmed,1);
});
