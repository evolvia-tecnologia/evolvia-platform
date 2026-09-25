import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentLabel, registrationLabel, sessionDelay } from '../components/participant-status.ts';

test('inscrição e pagamento são compreensíveis em todos os estados do banco', () => {
  assert.deepEqual(
    ['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED'].map(registrationLabel),
    ['Aguardando pagamento', 'Confirmada', 'Reserva expirada', 'Cancelada'],
  );
  assert.deepEqual(
    ['CREATING', 'ACTIVE', 'PAID', 'PAID_REVIEW', 'CANCELED', 'EXPIRED', 'FAILED', 'UNKNOWN'].map(paymentLabel),
    ['Preparando pagamento', 'Aguardando pagamento', 'Pago', 'Pagamento em análise', 'Cancelado', 'Pagamento expirado', 'Falha no pagamento', 'Situação em verificação'],
  );
  assert.equal(paymentLabel(null), 'Não aplicável');
  assert.equal(registrationLabel('FUTURE_STATUS'), 'Em análise');
  assert.equal(paymentLabel('FUTURE_STATUS'), 'Situação em verificação');
});

test('sessão encerra no instante da expiração e falha fechada para data inválida', () => {
  const now = Date.parse('2026-09-23T12:00:00.000Z');
  assert.equal(sessionDelay('2026-09-23T12:00:01.000Z', now), 1000);
  assert.equal(sessionDelay('2026-09-23T12:00:00.000Z', now), 0);
  assert.equal(sessionDelay('2026-09-23T11:59:59.000Z', now), 0);
  assert.equal(sessionDelay('invalid', now), 0);
});
