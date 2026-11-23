import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublishedScheduleBody,
  isPublishedEventStatus,
  publishedScheduleRejection,
  publishedScheduleUnavailableMessage,
} from '../lib/event-published-schedule.ts';

test('publicado é só PUBLISHED; DRAFT/SETUP seguem no Wizard', () => {
  assert.equal(isPublishedEventStatus('PUBLISHED'), true);
  assert.equal(isPublishedEventStatus('DRAFT'), false);
  assert.equal(isPublishedEventStatus('SETUP'), false);
  assert.equal(isPublishedEventStatus('READY_TO_PUBLISH'), false);
});

test('corpo do PATCH agenda inclui expectedUpdatedAt, motivo e campos enviados', () => {
  assert.deepEqual(
    buildPublishedScheduleBody({
      expectedUpdatedAt: '2026-11-23T12:00:00.000Z',
      motivo: '  Prorrogação  ',
      startDate: '2026-12-01T03:00:00.000Z',
      endDate: '2026-12-02T03:00:00.000Z',
      timeZone: 'America/Sao_Paulo',
    }),
    {
      expectedUpdatedAt: '2026-11-23T12:00:00.000Z',
      motivo: 'Prorrogação',
      startDate: '2026-12-01T03:00:00.000Z',
      endDate: '2026-12-02T03:00:00.000Z',
      timeZone: 'America/Sao_Paulo',
    },
  );
  assert.deepEqual(
    buildPublishedScheduleBody({
      expectedUpdatedAt: '2026-11-23T12:00:00.000Z',
      motivo: 'Local',
      venue: 'Centro',
      includeVenue: true,
    }),
    {
      expectedUpdatedAt: '2026-11-23T12:00:00.000Z',
      motivo: 'Local',
      venue: 'Centro',
    },
  );
});

test('confirmação só aceita resposta com o mesmo instante/fuso; 404 não promete gravação', () => {
  const snapshot = {
    startDate: '2026-12-01T03:00:00.000Z',
    endDate: '2026-12-02T03:00:00.000Z',
    timeZone: 'America/Sao_Paulo',
  };
  assert.equal(
    publishedScheduleRejection(snapshot, { ...snapshot, updatedAt: '2026-11-23T13:00:00.000Z' }),
    null,
  );
  assert.match(
    publishedScheduleRejection(snapshot, { ...snapshot, startDate: '2026-12-10T03:00:00.000Z' }) ?? '',
    /manteve a data anterior/,
  );
  assert.match(
    publishedScheduleUnavailableMessage(404) ?? '',
    /ainda não está disponível|#666/,
  );
  assert.equal(publishedScheduleUnavailableMessage(400), null);
});
