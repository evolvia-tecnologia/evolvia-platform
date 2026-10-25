import test from 'node:test';
import assert from 'node:assert/strict';
import { EventCommunicationService } from '../dist/event-communication.service.js';
import { normalizeCommunicationDraft } from '../dist/event-communication.policy.js';
const id = '12345678-1234-4123-8123-123456789abc';
const input = (revision = 0, subject = 'Aviso') => ({ subject, body: '**Olá**', expectedRevision: revision });
function harness() {
  const rows = [], audits = [];
  let authorized = true, transactions = 0;
  const scoped = (where) => { assert.equal(where.organizationId, 'org-a'); assert.equal(where.eventId, 'event-a'); return rows.filter(r => r.organizationId === where.organizationId && r.eventId === where.eventId && (!where.id || where.id === r.id)); };
  const db = {
    event: { findUnique: async () => ({ id: 'event-a', organizationId: 'org-a' }) },
    eventCommunicationDraft: {
      findMany: async ({where}) => scoped(where).map(({body, organizationId, eventId, ...row}) => row),
      findUnique: async ({where}) => scoped(where.id_eventId_organizationId)[0] ?? null,
      count: async ({where}) => scoped(where).length,
      create: async ({data}) => { const row = {...data, revision:1, updatedAt:new Date()}; rows.push(row); return row; },
      update: async ({where, data}) => { const row = scoped(where.id_eventId_organizationId)[0]; Object.assign(row, {subject:data.subject,body:data.body,revision:row.revision+1}); return row; },
    },
    auditLog: {create: async ({data}) => audits.push(data)},
    $queryRaw: async (strings, ...values) => { assert.match(strings.join('?'), /FOR UPDATE/); assert.deepEqual(values,['event-a','org-a']); return []; },
    $transaction: async fn => { transactions++; return fn(db); },
  };
  const service = new EventCommunicationService(db, {requireRole: async (_user, org, roles) => { assert.equal(org,'org-a'); assert.ok(!roles.includes('OPERATOR')); if (!authorized) throw new Error('forbidden'); }});
  return {service, rows, audits, deny:()=>authorized=false, transactions:()=>transactions};
}
test('assunto bloqueia header injection antes de normalizar e conteúdo usa gramática segura', () => {
  for (const subject of ['Aviso\r\nBcc: x@test.invalid','<script>','\tAviso']) assert.throws(()=>normalizeCommunicationDraft({...input(),subject}));
  for (const body of ['<img src=x>','[clique](javascript:alert(1))','[[fmt evil 99 red]]x[[/fmt]]','x\u0000']) assert.throws(()=>normalizeCommunicationDraft({...input(),body}));
  assert.equal(normalizeCommunicationDraft({...input(),body:'[[fmt serif 20 navy]]**Olá**[[/fmt]]'}).subject,'Aviso');
});
test('valida limites e rejeita campos extras/segredo e revisões inválidas',()=> {
  for (const patch of [{subject:''},{subject:'x'.repeat(181)},{body:'x'.repeat(20001)},{expectedRevision:-1},{expectedRevision:1.5},{organizationId:'other'},{password:'secret'}]) assert.throws(()=>normalizeCommunicationDraft({...input(),...patch}));
});
test('salva e reabre rascunho no escopo autorizado; auditoria não copia conteúdo',async()=> {
  const h=harness(); const row=await h.service.save('user','event-a',id,input());
  assert.equal(row.revision,1); assert.equal((await h.service.get('user','event-a',id)).subject,'Aviso');
  assert.equal(h.audits.length,1); assert.deepEqual(h.audits[0].metadata,{revision:1});
  assert.doesNotMatch(JSON.stringify(h.audits),/Olá|Aviso/);
});
test('repetir requisição após resposta perdida não duplica rascunho nem auditoria',async()=> {
  const h=harness(); await h.service.save('u','event-a',id,input()); await h.service.save('u','event-a',id,input());
  assert.equal(h.rows.length,1); assert.equal(h.audits.length,1);
});
test('edição antiga não sobrescreve outra revisão nem texto diferente',async()=> {
  const h=harness(); await h.service.save('u','event-a',id,input()); await h.service.save('u','event-a',id,input(1,'Atual'));
  await assert.rejects(h.service.save('u','event-a',id,input(1,'Outra')),/outra tela/); assert.equal(h.rows[0].subject,'Atual');
});
test('outro evento/organização não é lido nem alterado',async()=> {
  const h=harness(); h.rows.push({id,eventId:'event-b',organizationId:'org-b',revision:1,subject:'Privado',body:'Privado'});
  assert.equal((await h.service.list('u','event-a')).drafts.length,0);
  await assert.rejects(h.service.get('u','event-a',id),/não encontrado/);
});
test('operador sem permissão não consulta ou grava; id inválido não abre transação',async()=> {
  const h=harness(); h.deny(); for(const method of [()=>h.service.list('u','event-a'),()=>h.service.get('u','event-a',id),()=>h.service.save('u','event-a',id,input())]) await assert.rejects(method,/forbidden/);
  assert.equal(h.transactions(),0);
  await assert.rejects(harness().service.save('u','event-a','../../etc/passwd',input()),/inválido/);
});
