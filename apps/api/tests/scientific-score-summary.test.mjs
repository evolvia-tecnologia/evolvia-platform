import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReviewScore } from '../src/scientific-review-policy.ts';

test('resumo usa nota única mesmo sem critérios analíticos', () => {
  assert.equal(calculateReviewScore('SYNTHETIC', [], [{ criterionId: 'overall', value: 8.5 }]), 8.5);
  assert.equal(calculateReviewScore('SYNTHETIC', [], []), null);
  assert.equal(calculateReviewScore('SYNTHETIC', [], [{ criterionId: 'overall', value: 11 }]), null);
});

test('resumo analítico conserva a média ponderada', () => {
  const criteria = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
  assert.equal(calculateReviewScore('ANALYTIC', criteria, [{ criterionId: 'a', value: 4 }, { criterionId: 'b', value: 8 }]), 7);
});


test('mudar para nota única preserva a média dos pareceres analíticos já recebidos', () => {
  const criteria = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
  assert.equal(calculateReviewScore('SYNTHETIC', criteria, [{ criterionId: 'a', value: 4 }, { criterionId: 'b', value: 8 }]), 7);
});
