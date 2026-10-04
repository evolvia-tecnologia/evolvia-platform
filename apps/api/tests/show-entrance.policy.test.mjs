import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  CHECK_IN_REPEATED_ACTION,
  TURNSTILE_ACTIVE_LIMIT,
  TURNSTILE_DENIED_MESSAGE,
  TURNSTILE_KEY_TTL_MS,
  canManageShowOperations,
  classifyEntranceCode,
  issueStaffCode,
  issueTurnstileKey,
  normalizeTurnstileShare,
  parseTurnstileBearer,
  projectTurnstileTicket,
  registrationDisplayName,
  showTicketStatus,
} from '../src/show-entrance.policy.ts';

const shareAll = { shareName: true, shareTicketType: true, shareStatus: true, shareCode: true };

test('status do ingresso separa pago, isento, cancelado e o que não entra na catraca', () => {
  assert.equal(showTicketStatus({ status: 'CANCELLED', finalPriceCents: 1000, checkoutStatus: 'PAID' }), 'CANCELADO');
  assert.equal(showTicketStatus({ status: 'CONFIRMED', finalPriceCents: 0, checkoutStatus: null }), 'ISENTO');
  assert.equal(showTicketStatus({ status: 'CONFIRMED', finalPriceCents: 15000, checkoutStatus: 'PAID' }), 'PAGO');
  assert.equal(showTicketStatus({ status: 'CONFIRMED', finalPriceCents: 15000, checkoutStatus: 'ACTIVE' }), null);
  assert.equal(showTicketStatus({ status: 'PENDING_PAYMENT', finalPriceCents: 15000, checkoutStatus: null }), null);
  assert.equal(showTicketStatus({ status: 'EXPIRED', finalPriceCents: 0, checkoutStatus: null }), null);
});

test('projeção da catraca copia só os campos marcados e ignora e-mail e documento', () => {
  const ticket = {
    participantName: 'Ana Silva',
    ticketType: 'Pista',
    status: 'PAGO',
    ticketCode: 'EVQ1.exemplo',
    email: 'ana@example.com',
    document: '12345678901',
  };
  assert.deepEqual(projectTurnstileTicket(shareAll, ticket), {
    participantName: 'Ana Silva',
    ticketType: 'Pista',
    status: 'PAGO',
    ticketCode: 'EVQ1.exemplo',
  });
  assert.deepEqual(projectTurnstileTicket({ ...shareAll, shareName: false, shareCode: false }, ticket), {
    ticketType: 'Pista',
    status: 'PAGO',
  });
  assert.equal('email' in projectTurnstileTicket(shareAll, ticket), false);
  assert.equal('document' in projectTurnstileTicket(shareAll, ticket), false);
});

test('nome do participante não leva e-mail nem CPF disfarçado', () => {
  assert.equal(registrationDisplayName({ preferred_name: 'Ana', full_name: 'Ana Silva', email: 'ana@example.com' }), 'Ana');
  assert.equal(registrationDisplayName({ preferred_name: 'ana@example.com', full_name: 'Ana Silva' }), 'Ana Silva');
  assert.equal(registrationDisplayName({ full_name: '123.456.789-09', email: 'ana@example.com' }), null);
  assert.equal(registrationDisplayName({ email: 'ana@example.com' }), null);
});

test('credencial de equipe e chave de catraca guardam só o hash', () => {
  const staff = issueStaffCode();
  assert.match(staff.code, /^EVS1\.[a-f0-9]{32}$/u);
  assert.equal(staff.codeHash, createHash('sha256').update(staff.code).digest('hex'));
  assert.equal(staff.codeHash.includes(staff.code), false);

  const key = issueTurnstileKey();
  assert.match(key.secret, /^evg_[A-Za-z0-9_-]{32,80}$/u);
  assert.equal(key.keyHash, createHash('sha256').update(key.secret).digest('hex'));
  assert.equal(key.keyHint, key.secret.slice(-4));
  assert.equal(parseTurnstileBearer(`Bearer ${key.secret}`), key.secret);
  assert.equal(parseTurnstileBearer(key.secret), null);
  assert.equal(parseTurnstileBearer('Bearer EVS1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), null);
});

test('código de equipe não é tratado como ingresso', () => {
  const staff = issueStaffCode();
  assert.deepEqual(classifyEntranceCode(staff.code), { kind: 'STAFF', code: staff.code });
  assert.equal(classifyEntranceCode('EVQ1.cm12345678901234567890123.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').kind, 'TICKET');
  assert.equal(classifyEntranceCode('EVS1.curto').kind, 'INVALID');
  assert.equal(TURNSTILE_DENIED_MESSAGE, 'Ingresso não autorizado.');
});

test('a catraca exige ao menos um campo e não aceita texto no lugar do sim ou não', () => {
  assert.throws(() => normalizeTurnstileShare({ shareName: 'true' }), /sim ou não/u);
  assert.throws(() => normalizeTurnstileShare({}), /ao menos um dado/u);
  assert.deepEqual(normalizeTurnstileShare({ shareCode: true }), {
    shareName: false, shareTicketType: false, shareStatus: false, shareCode: true,
  });
});

test('gestão emite credenciais e a operação só consulta', () => {
  assert.equal(canManageShowOperations('OWNER'), true);
  assert.equal(canManageShowOperations('ADMIN'), true);
  assert.equal(canManageShowOperations('MANAGER'), true);
  assert.equal(canManageShowOperations('OPERATOR'), false);
  assert.equal(TURNSTILE_ACTIVE_LIMIT, 3);
  assert.equal(TURNSTILE_KEY_TTL_MS, 90 * 24 * 60 * 60 * 1000);
  assert.equal(CHECK_IN_REPEATED_ACTION, 'registration.check_in_repeated');
});
