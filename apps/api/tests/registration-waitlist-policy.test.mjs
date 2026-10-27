import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RegistrationWaitlistPolicyError,
  combinedFreeSeats,
  effectiveWaitlistStatus,
  freeSeats,
  normalizeWaitlistConfig,
  normalizeWaitlistKey,
  normalizeWaitlistLotId,
  offerExpiresAt,
  queueOrder,
  waitlistAcceptsEntries,
  waitlistEntryCode,
} from '../src/registration-waitlist-policy.ts';

const now = new Date('2026-10-07T12:00:00Z');
const lotEndsAt = new Date('2026-10-10T12:00:00Z');

test('configuração exige prazo de confirmação ao ativar e limita a janela', () => {
  assert.deepEqual(normalizeWaitlistConfig({ enabled: true, offerMinutes: 60 }, now, lotEndsAt), { enabled: true, offerMinutes: 60, closesAt: null });
  assert.deepEqual(normalizeWaitlistConfig({ enabled: false }, now, lotEndsAt), { enabled: false, offerMinutes: null, closesAt: null });
  const closesAt = '2026-10-09T12:00:00.000Z';
  assert.equal(normalizeWaitlistConfig({ enabled: true, offerMinutes: 15, closesAt }, now, lotEndsAt).closesAt.toISOString(), closesAt);
  for (const raw of [
    null, [], {}, { enabled: 'true' }, { enabled: true }, { enabled: true, offerMinutes: 14 }, { enabled: true, offerMinutes: 10_081 },
    { enabled: true, offerMinutes: 30.5 }, { enabled: true, offerMinutes: '30' },
    { enabled: true, offerMinutes: 30, closesAt: 'amanhã' }, { enabled: true, offerMinutes: 30, closesAt: '2026-10-07T11:00:00Z' },
    { enabled: true, offerMinutes: 30, closesAt: '2026-10-11T12:00:00Z' },
  ]) {
    assert.throws(() => normalizeWaitlistConfig(raw, now, lotEndsAt), RegistrationWaitlistPolicyError, JSON.stringify(raw));
  }
});

test('fila aceita entradas só ativa, antes do encerramento e dentro do lote', () => {
  assert.equal(waitlistAcceptsEntries({ waitlistEnabled: true, waitlistClosesAt: null, endsAt: lotEndsAt }, now), true);
  assert.equal(waitlistAcceptsEntries({ waitlistEnabled: false, waitlistClosesAt: null, endsAt: lotEndsAt }, now), false);
  assert.equal(waitlistAcceptsEntries({ waitlistEnabled: true, waitlistClosesAt: now, endsAt: lotEndsAt }, now), false);
  assert.equal(waitlistAcceptsEntries({ waitlistEnabled: true, waitlistClosesAt: null, endsAt: now }, now), false);
});

test('ofertas ativas ocupam vaga e o limite mais restritivo vale', () => {
  assert.equal(freeSeats(null, 10, 3), null);
  assert.equal(freeSeats(5, 4, 1), 0);
  assert.equal(freeSeats(5, 6, 0), 0);
  assert.equal(freeSeats(5, 3, 1), 1);
  assert.equal(combinedFreeSeats(null, null), null);
  assert.equal(combinedFreeSeats(3, null), 3);
  assert.equal(combinedFreeSeats(null, 0), 0);
  assert.equal(combinedFreeSeats(4, 2), 2);
});

test('oferta vence no prazo ou no fim do lote, o que vier primeiro', () => {
  assert.equal(offerExpiresAt(now, 60, lotEndsAt).toISOString(), '2026-10-07T13:00:00.000Z');
  assert.equal(offerExpiresAt(now, 10_080, lotEndsAt).toISOString(), lotEndsAt.toISOString());
  assert.equal(effectiveWaitlistStatus('OFFERED', new Date(now.getTime() + 1), now), 'OFFERED');
  assert.equal(effectiveWaitlistStatus('OFFERED', now, now), 'OFFER_EXPIRED');
  assert.equal(effectiveWaitlistStatus('OFFERED', null, now), 'OFFER_EXPIRED');
  assert.equal(effectiveWaitlistStatus('WAITING', null, now), 'WAITING');
});

test('ordem FIFO estável e código pseudônimo sem dado pessoal', () => {
  const entries = [
    { id: 'b', queuedAt: new Date('2026-10-07T10:00:00Z') },
    { id: 'c', queuedAt: new Date('2026-10-07T09:00:00Z') },
    { id: 'a', queuedAt: new Date('2026-10-07T10:00:00Z') },
  ];
  assert.deepEqual([...entries].sort(queueOrder).map((entry) => entry.id), ['c', 'a', 'b']);
  const code = waitlistEntryCode('cm123entry');
  assert.match(code, /^FILA-[A-F0-9]{8}$/u);
  assert.equal(code, waitlistEntryCode('cm123entry'));
  assert.notEqual(code, waitlistEntryCode('cm124entry'));
});

test('lote e chave de idempotência seguem o formato seguro', () => {
  assert.equal(normalizeWaitlistLotId('cmlot_123456'), 'cmlot_123456');
  assert.equal(normalizeWaitlistKey(' 0f8b2c1e-1234-4bcd-9abc-1234567890ab '), '0f8b2c1e-1234-4bcd-9abc-1234567890ab');
  for (const value of [undefined, '', 'curto', '../../etc', 42]) assert.throws(() => normalizeWaitlistLotId(value), RegistrationWaitlistPolicyError);
  for (const value of [undefined, 'curta', 'x'.repeat(129), 'chave com espaço inválida']) assert.throws(() => normalizeWaitlistKey(value), RegistrationWaitlistPolicyError);
});
