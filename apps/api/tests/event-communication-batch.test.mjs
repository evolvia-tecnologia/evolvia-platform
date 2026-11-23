import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { EventCommunicationAudienceService } from '../dist/event-communication-audience.service.js';
import { hasCommunicationOptIn } from '../dist/event-communication-audience.policy.js';
import {
  communicationBatchPayloadHash, communicationOutboxKey, normalizeCommunicationBatch,
  sealCommunicationRecipient, openCommunicationRecipient,
} from '../dist/event-communication-batch.policy.js';

const batchId = randomUUID();
const draftId = randomUUID();
const input = () => ({ id: batchId, draftId, draftRevision: 1,
  filters: { audience: 'CONFIRMED_REGISTRATIONS', payment: 'ALL' } });

test('G6.8 só prepara lote com UUID, versão e filtro permitidos; nenhum campo externo de destinatário', () => {
  const normalized = normalizeCommunicationBatch(input());
  assert.equal(normalized.filters.page, 1);
  assert.equal(normalized.filters.audience, 'CONFIRMED_REGISTRATIONS');
  assert.equal(communicationBatchPayloadHash('org-a','event-a',normalized).length,64);
  assert.notEqual(communicationBatchPayloadHash('org-a','event-a',normalized),
    communicationBatchPayloadHash('org-b','event-a',normalized));
  for (const patch of [
    { id: 'not-id' }, { draftId: '../other' }, { draftRevision: -1 },
    { draftRevision: 1.5 }, { filters: { audience: 'ALL_SCIENTIFIC_AUTHORS' } },
    { filters: { page: 2 } }, { emails: ['outside@example.test'] },
    { organizationId: 'other' }, { send: true }, { body: 'unsafe' },
  ]) assert.throws(() => normalizeCommunicationBatch({ ...input(), ...patch }));
});

test('G6.8 criptografa destinatários com envelope autenticado, sem email em texto ou HMAC reversível', () => {
  const key = communicationOutboxKey(randomBytes(32).toString('base64'));
  const scope = { organizationId: 'org-a', eventId: 'event-a', batchId };
  const email = 'Pessoa.Exemplo@example.test';
  const first = sealCommunicationRecipient(email, scope, key);
  const second = sealCommunicationRecipient(email, scope, key);
  assert.equal(first.emailFingerprint, second.emailFingerprint, 'dedup estável no mesmo lote');
  assert.notEqual(first.emailEnvelope, second.emailEnvelope, 'cada mensagem deve usar nonce aleatório');
  assert.doesNotMatch(JSON.stringify(first), /Pessoa|Exemplo|@example.test/u);
  assert.equal(openCommunicationRecipient(first.emailEnvelope, scope, key), email.toLowerCase());
  assert.throws(() => openCommunicationRecipient(first.emailEnvelope,
    { ...scope, organizationId: 'org-b' }, key), 'vínculo por tenant é obrigatório');
  assert.throws(() => openCommunicationRecipient(first.emailEnvelope, scope, randomBytes(32)));
  assert.throws(() => communicationOutboxKey('not-a-real-key'));
});

test('G6.8 opt-in é estritamente boolean true: ausente, string e recusado nunca autorizam lote', () => {
  for (const input of [null,undefined,[],{}, {communication_opt_in:false},
    {communication_opt_in:'true'}, {communication_opt_in:1}]) {
    assert.equal(hasCommunicationOptIn(input),false);
  }
  assert.equal(hasCommunicationOptIn({ email:'one@example.test', communication_opt_in:true }), true);
});

test('G6.8 snapshot completo conserva prévia, mas lote só usa inscrições consentidas no evento', async () => {
  const rows = [
    { registrationData: { full_name:'Ana', email:'ana@example.test', communication_opt_in:true } },
    { registrationData: { full_name:'Sem aceite', email:'nao@example.test' } },
    { registrationData: { full_name:'Recusou', email:'recusou@example.test', communication_opt_in:false } },
    { registrationData: { full_name:'Duplicada', email:'ANA@example.test', communication_opt_in:true } },
  ];
  let reads=0;
  const service = new EventCommunicationAudienceService({
    event: { findUnique:async()=>({id:'event-a',organizationId:'org-a'}) },
    eventRegistrationReservation: {findMany:async({where,select,take})=>{
      assert.deepEqual(where.AND.slice(0,2),[{eventId:'event-a',organizationId:'org-a'},{status:'CONFIRMED'}]);
      assert.deepEqual(select,{registrationData:true});assert.equal(take,5001);reads++;return rows;
    }},
  }, {requireRole:async()=>{}});
  const audience = await service.snapshot('owner','event-a',{},true);
  assert.deepEqual(audience.contacts.map(x=>x.email), ['ana@example.test']);
  assert.equal(audience.excludedWithoutConsent,2);
  const preview = await service.preview('owner','event-a',{});
  assert.equal(preview.total,3, 'prévia ainda indica contatos encontrados antes do consentimento');
  assert.equal(preview.sendingAvailable,false);
  assert.equal(reads,2);
  await assert.rejects(service.snapshot('owner','event-a',{audience:'ALL_SCIENTIFIC_AUTHORS'},true),
    /consentimento/u);
});


test('G6.8 accepts canonical UUIDv4/v7 while normalizing case for idempotency', () => {
  const lower = input();
  const upper = { ...lower, id: lower.id.toUpperCase(), draftId: lower.draftId.toUpperCase() };
  assert.deepEqual(normalizeCommunicationBatch(lower), normalizeCommunicationBatch(upper));
  const next = { ...lower, id: lower.id.replace(/^([0-9a-f]{8}-[0-9a-f]{4}-)4/u,'$17') };
  // Version 7 identifiers should remain valid if generated by a future client.
  assert.equal(normalizeCommunicationBatch(next).id, next.id);
});
