import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canPerformModerationAction,
  targetStatusForModerationAction,
} from '../dist/platform-admin/moderation-policy.js';

const EventStatus = {
  DRAFT: 'DRAFT',
  SETUP: 'SETUP',
  HOMOLOGATION: 'HOMOLOGATION',
  READY_TO_PUBLISH: 'READY_TO_PUBLISH',
  PUBLISHED: 'PUBLISHED',
  SUSPENDED: 'SUSPENDED',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED',
};

test('papéis internos seguem deny-by-default e separação de funções', () => {
  assert.equal(canPerformModerationAction('SUPER_ADMIN', 'SUSPEND_EVENT'), true);
  assert.equal(canPerformModerationAction('SUPER_ADMIN', 'CANCEL_EVENT'), true);

  assert.equal(canPerformModerationAction('TRUST_SAFETY', 'SUSPEND_EVENT'), true);
  assert.equal(canPerformModerationAction('TRUST_SAFETY', 'RESTORE_EVENT'), true);
  assert.equal(canPerformModerationAction('TRUST_SAFETY', 'CANCEL_EVENT'), false);

  assert.equal(canPerformModerationAction('SUPPORT', 'OPEN_CASE'), true);
  assert.equal(canPerformModerationAction('SUPPORT', 'ESCALATE'), true);
  assert.equal(canPerformModerationAction('SUPPORT', 'SUSPEND_EVENT'), false);

  assert.equal(canPerformModerationAction('ANALYST', 'OPEN_CASE'), false);
  assert.equal(canPerformModerationAction('ANALYST', 'ADD_NOTE'), false);
});

test('suspensão só parte de estados operacionais e nunca sobrescreve término/cancelamento', () => {
  for (const status of [
    EventStatus.DRAFT,
    EventStatus.SETUP,
    EventStatus.HOMOLOGATION,
    EventStatus.READY_TO_PUBLISH,
    EventStatus.PUBLISHED,
  ]) {
    assert.equal(targetStatusForModerationAction('SUSPEND_EVENT', status), EventStatus.SUSPENDED);
  }

  for (const status of [EventStatus.SUSPENDED, EventStatus.FINISHED, EventStatus.CANCELLED]) {
    assert.throws(
      () => targetStatusForModerationAction('SUSPEND_EVENT', status),
      /EVENT_STATUS_NOT_SUSPENDABLE/,
    );
  }
});

test('restauração exige evento suspenso e restaura explicitamente o estado anterior permitido', () => {
  assert.equal(
    targetStatusForModerationAction('RESTORE_EVENT', EventStatus.SUSPENDED, EventStatus.PUBLISHED),
    EventStatus.PUBLISHED,
  );
  assert.equal(
    targetStatusForModerationAction('RESTORE_EVENT', EventStatus.SUSPENDED, EventStatus.READY_TO_PUBLISH),
    EventStatus.READY_TO_PUBLISH,
  );

  assert.throws(
    () => targetStatusForModerationAction('RESTORE_EVENT', EventStatus.PUBLISHED, EventStatus.PUBLISHED),
    /EVENT_STATUS_NOT_SUSPENDED/,
  );
  assert.throws(
    () => targetStatusForModerationAction('RESTORE_EVENT', EventStatus.SUSPENDED),
    /EVENT_RESTORE_STATUS_INVALID/,
  );
  assert.throws(
    () => targetStatusForModerationAction('RESTORE_EVENT', EventStatus.SUSPENDED, EventStatus.FINISHED),
    /EVENT_RESTORE_STATUS_INVALID/,
  );
});

test('encerramento normal não é atalho para remover evento suspenso', () => {
  assert.equal(
    targetStatusForModerationAction('MARK_FINISHED', EventStatus.PUBLISHED),
    EventStatus.FINISHED,
  );
  assert.throws(
    () => targetStatusForModerationAction('MARK_FINISHED', EventStatus.SUSPENDED),
    /EVENT_STATUS_NOT_FINISHABLE/,
  );
});

test('cancelamento aceita estados ativos e suspensão, mas não reabre evento terminal', () => {
  assert.equal(
    targetStatusForModerationAction('CANCEL_EVENT', EventStatus.SUSPENDED),
    EventStatus.CANCELLED,
  );
  assert.throws(
    () => targetStatusForModerationAction('CANCEL_EVENT', EventStatus.FINISHED),
    /EVENT_STATUS_NOT_CANCELLABLE/,
  );
  assert.throws(
    () => targetStatusForModerationAction('CANCEL_EVENT', EventStatus.CANCELLED),
    /EVENT_STATUS_NOT_CANCELLABLE/,
  );
});
