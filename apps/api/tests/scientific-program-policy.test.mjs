import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificInvitationStatus, ScientificParticipationType } from '@prisma/client';
import {
  invitationStatusWarning,
  programIntervalsOverlap,
  validateProgramActivityWindow,
  validateProgramParticipationRole,
} from '../dist/scientific-program-policy.js';

test('intervalos consecutivos não geram conflito artificial', () => {
  assert.equal(
    programIntervalsOverlap(
      new Date('2026-09-10T10:00:00-03:00'),
      new Date('2026-09-10T11:00:00-03:00'),
      new Date('2026-09-10T11:00:00-03:00'),
      new Date('2026-09-10T12:00:00-03:00'),
    ),
    false,
  );
});

test('intervalos sobrepostos geram conflito', () => {
  assert.equal(
    programIntervalsOverlap(
      new Date('2026-09-10T10:00:00-03:00'),
      new Date('2026-09-10T11:30:00-03:00'),
      new Date('2026-09-10T11:00:00-03:00'),
      new Date('2026-09-10T12:00:00-03:00'),
    ),
    true,
  );
});

test('impede horário final igual ou anterior ao inicial', () => {
  const conflicts = validateProgramActivityWindow({
    startAt: new Date('2026-09-10T11:00:00-03:00'),
    endAt: new Date('2026-09-10T11:00:00-03:00'),
  });
  assert.equal(conflicts[0]?.code, 'INVALID_INTERVAL');
  assert.equal(conflicts[0]?.severity, 'BLOCKING');
});

test('impede atividade fora das datas do evento', () => {
  const conflicts = validateProgramActivityWindow({
    startAt: new Date('2026-09-09T23:00:00-03:00'),
    endAt: new Date('2026-09-10T01:00:00-03:00'),
    eventStart: new Date('2026-09-10T00:00:00-03:00'),
    eventEnd: new Date('2026-09-12T23:59:59-03:00'),
  });
  assert.equal(conflicts.some((item) => item.code === 'OUTSIDE_EVENT_DATES'), true);
});

test('outra função exige rótulo personalizado', () => {
  const conflicts = validateProgramParticipationRole(ScientificParticipationType.OTHER, '');
  assert.equal(conflicts[0]?.code, 'CUSTOM_ROLE_REQUIRED');
  assert.equal(validateProgramParticipationRole(ScientificParticipationType.MODERATOR, null).length, 0);
});

test('convite recusado ou cancelado vira alerta, não bloqueio', () => {
  assert.equal(invitationStatusWarning(ScientificInvitationStatus.DECLINED)?.severity, 'WARNING');
  assert.equal(invitationStatusWarning(ScientificInvitationStatus.CANCELLED)?.severity, 'WARNING');
  assert.equal(invitationStatusWarning(ScientificInvitationStatus.CONFIRMED), null);
});
