import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EmailVerificationDispatchService,
  EmailVerificationDispatchUnavailableError,
  EmailVerificationOperationalDiagnostics,
} from '../dist/auth/email-verification-dispatch.service.js';

function createHarness({ issueError, deliveryError, revokeError, auditError } = {}) {
  const issued = {
    tokenId: 'verify_1',
    recipient: 'canonical@example.com',
    token: 'secret-token',
    expiresAt: new Date('2026-08-20T20:00:00.000Z'),
  };
  const state = { deliveries: [], revocations: [], audits: [], diagnostics: [] };
  const service = new EmailVerificationDispatchService({
    verification: {
      async issue() {
        if (issueError) throw issueError;
        return issued;
      },
      async revokeIssuedToken(tokenId) {
        state.revocations.push(tokenId);
        if (revokeError) throw revokeError;
      },
    },
    delivery: {
      async send(input) {
        state.deliveries.push(input);
        if (deliveryError) throw deliveryError;
      },
    },
    audit: {
      async record(input) {
        state.audits.push(input);
        if (auditError) throw auditError;
      },
    },
    diagnostics: {
      async capture(input) {
        state.diagnostics.push(input);
      },
    },
  });
  return { service, state, issued };
}

test('entrega somente ao destinatário canônico retornado pela emissão', async () => {
  const { service, state, issued } = createHarness();

  await service.send('usr_1');

  assert.deepEqual(state.deliveries, [{
    recipient: issued.recipient,
    token: issued.token,
    expiresAt: issued.expiresAt,
  }]);
  assert.deepEqual(state.audits, [{
    action: 'email_verification.request',
    outcome: 'DELIVERED',
    subjectUserId: 'usr_1',
  }]);
});

test('falha de entrega revoga token emitido e não vaza a causa', async () => {
  const { service, state } = createHarness({ deliveryError: new Error('SMTP 550 secret-token') });

  await assert.rejects(service.send('usr_1'), EmailVerificationDispatchUnavailableError);

  assert.deepEqual(state.revocations, ['verify_1']);
  assert.deepEqual(state.diagnostics, [{
    operation: 'email_verification.request',
    stage: 'DELIVERY',
  }]);
  assert.equal(JSON.stringify(state.audits).includes('secret-token'), false);
  assert.equal(JSON.stringify(state.diagnostics).includes('SMTP'), false);
});

test('falha de persistência não tenta entrega e recebe resultado público único', async () => {
  const { service, state } = createHarness({ issueError: new Error('database offline') });

  await assert.rejects(service.send('usr_1'), EmailVerificationDispatchUnavailableError);

  assert.deepEqual(state.deliveries, []);
  assert.deepEqual(state.revocations, []);
  assert.equal(state.audits[0].outcome, 'PERSISTENCE_FAILED');
  assert.equal(state.diagnostics[0].stage, 'PERSISTENCE');
});

test('falha da revogação é diagnosticada sem substituir o erro público', async () => {
  const { service, state } = createHarness({
    deliveryError: new Error('delivery'),
    revokeError: new Error('revoke'),
  });

  await assert.rejects(service.send('usr_1'), EmailVerificationDispatchUnavailableError);
  assert.deepEqual(state.diagnostics.map((item) => item.stage), ['DELIVERY', 'REVOCATION']);
});

test('falha de auditoria não transforma entrega concluída em falha ao usuário', async () => {
  const { service, state } = createHarness({ auditError: new Error('audit offline') });

  await service.send('usr_1');

  assert.deepEqual(state.diagnostics, [{
    operation: 'email_verification.request',
    stage: 'AUDIT',
  }]);
});

test('diagnóstico operacional registra apenas evento e estágio permitidos', async () => {
  const warnings = [];
  const diagnostics = new EmailVerificationOperationalDiagnostics({
    warn(message) {
      warnings.push(message);
    },
  });

  await diagnostics.capture({ operation: 'email_verification.request', stage: 'DELIVERY' });

  assert.deepEqual(warnings, [{
    event: 'email_verification.operation_failed',
    stage: 'DELIVERY',
  }]);
});
