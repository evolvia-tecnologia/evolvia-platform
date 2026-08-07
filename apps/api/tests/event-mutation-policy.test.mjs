import assert from 'node:assert/strict';
import test from 'node:test';
import { EventStatus } from '@prisma/client';
import { EventMutationPolicy } from '../dist/event-mutation-policy.service.js';

const policy = new EventMutationPolicy();

for (const status of [EventStatus.DRAFT, EventStatus.SETUP]) {
  test(`permite alterar a fundação no estado ${status}`, () => {
    assert.doesNotThrow(() => policy.assertFoundationMutable(status));
  });
}

for (const status of [
  EventStatus.HOMOLOGATION,
  EventStatus.READY_TO_PUBLISH,
  EventStatus.PUBLISHED,
  EventStatus.SUSPENDED,
  EventStatus.FINISHED,
  EventStatus.CANCELLED,
]) {
  test(`bloqueia alteração da fundação no estado protegido ${status}`, () => {
    assert.throws(
      () => policy.assertFoundationMutable(status),
      (error) => {
        assert.equal(error.getStatus(), 409);
        assert.deepEqual(error.getResponse(), {
          code: 'INVALID_EVENT_STATE',
          message: 'A fundação não pode ser alterada no estado atual do evento.',
          context: { eventStatus: status },
        });
        return true;
      },
    );
  });
}

test('conclusão da fundação promove somente DRAFT para SETUP', () => {
  assert.equal(
    policy.statusAfterFoundationCompletion(EventStatus.DRAFT),
    EventStatus.SETUP,
  );
  assert.equal(
    policy.statusAfterFoundationCompletion(EventStatus.SETUP),
    EventStatus.SETUP,
  );
});
