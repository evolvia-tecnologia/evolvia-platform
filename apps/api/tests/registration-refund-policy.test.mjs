import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  describeAcceptedRefund,
  describeRefundPolicy,
  normalizeRefundText,
  subtractCalendarDays,
} from '../dist/registration-refund-policy.js';

const start = new Date('2026-11-01T03:00:00.000Z');
const saoPaulo = 'America/Sao_Paulo';

test('subtrai dias de calendário no fuso e mantém o horário de parede', () => {
  const one = subtractCalendarDays(start, 1, saoPaulo);
  assert.equal(one.toISOString(), '2026-10-31T03:00:00.000Z');
  const thirty = subtractCalendarDays(start, 30, saoPaulo);
  assert.equal(thirty.toISOString(), '2026-10-02T03:00:00.000Z');
});

test('a virada do horário de verão não usa 24 horas cruas', () => {
  const afterFallback = new Date('2026-11-02T06:00:00.000Z');
  const deadline = subtractCalendarDays(afterFallback, 1, 'America/New_York');
  assert.equal(deadline.toISOString(), '2026-11-01T05:00:00.000Z');
  assert.notEqual(deadline.getTime(), afterFallback.getTime() - 86_400_000);
});

test('a janela de um dia inclui o instante limite e exclui o milissegundo seguinte', () => {
  const atDeadline = describeRefundPolicy({
    window: 'DAYS_1',
    startDate: start,
    timeZone: saoPaulo,
    now: new Date('2026-10-31T03:00:00.000Z'),
  });
  assert.equal(atDeadline.eligible, true);
  assert.equal(atDeadline.deadline, '2026-10-31T03:00:00.000Z');
  assert.equal(atDeadline.pending, null);
  const after = describeRefundPolicy({
    window: 'DAYS_1',
    startDate: start,
    timeZone: saoPaulo,
    now: new Date('2026-10-31T03:00:00.001Z'),
  });
  assert.equal(after.eligible, false);
  assert.match(after.message, /prazo de reembolso terminou/u);
});

test('sem data ou sem fuso a elegibilidade fica pendente', () => {
  const missingStart = describeRefundPolicy({ window: 'DAYS_30', startDate: null, timeZone: saoPaulo, now: start });
  assert.equal(missingStart.eligible, null);
  assert.equal(missingStart.pending, 'START_DATE');
  assert.equal(missingStart.deadline, null);
  const missingZone = describeRefundPolicy({ window: 'DAYS_7', startDate: start, timeZone: null, now: start });
  assert.equal(missingZone.pending, 'TIME_ZONE');
  assert.equal(missingZone.eligible, null);
  const invalidZone = describeRefundPolicy({ window: 'DAYS_7', startDate: start, timeZone: 'Marte/Base', now: start });
  assert.equal(invalidZone.pending, 'TIME_ZONE');
  assert.equal(invalidZone.deadline, null);
});

test('nenhum momento e qualquer momento não dependem de data', () => {
  const none = describeRefundPolicy({ window: 'NONE', startDate: null, timeZone: null, now: start });
  assert.equal(none.eligible, false);
  assert.match(none.message, /nenhum momento/u);
  const anytime = describeRefundPolicy({ window: 'ANYTIME', startDate: null, timeZone: null, now: start });
  assert.equal(anytime.eligible, true);
  const unpublished = describeRefundPolicy({ window: null, startDate: start, timeZone: saoPaulo, now: start });
  assert.equal(unpublished.published, false);
  assert.equal(unpublished.eligible, null);
  assert.equal(unpublished.pending, 'POLICY');
});

test('a regra aceita ignora uma data de início posterior', () => {
  const frozen = describeAcceptedRefund({
    window: 'DAYS_1',
    deadlineAt: new Date('2026-10-31T03:00:00.000Z'),
    pendingCode: null,
    now: new Date('2026-10-31T03:00:00.000Z'),
    timeZone: saoPaulo,
  });
  assert.equal(frozen.eligible, true);
  assert.equal(frozen.deadline, '2026-10-31T03:00:00.000Z');
  const pending = describeAcceptedRefund({
    window: 'DAYS_30',
    deadlineAt: null,
    pendingCode: 'START_DATE',
    now: start,
    timeZone: saoPaulo,
  });
  assert.equal(pending.eligible, null);
  assert.match(pending.message, /Na compra, a data de início ainda não estava definida/u);
});

test('motivo e justificativa ficam entre 10 e 500 caracteres', () => {
  assert.equal(normalizeRefundText('  não   poderei   ir  ', 'O motivo'), 'não poderei ir');
  assert.throws(() => normalizeRefundText('curto', 'O motivo'), /entre 10 e 500/u);
  assert.throws(() => normalizeRefundText('a'.repeat(501), 'A justificativa'), /entre 10 e 500/u);
  assert.equal(normalizeRefundText('a'.repeat(500), 'A justificativa').length, 500);
});

test('o checkout grava a aceitação no momento em que a compra fica ativa', async () => {
  const checkout = await readFile(new URL('../src/asaas-checkout.service.ts', import.meta.url), 'utf8');
  assert.match(checkout, /recordAcceptance\(tx,/u);
  assert.doesNotMatch(checkout, /refundPayment|estornar|cancelCredential/u);
});
