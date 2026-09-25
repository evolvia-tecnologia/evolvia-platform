import assert from 'node:assert/strict';
import test from 'node:test';
import { enabledOperationalPermissions } from '../dist/operator-capability-policy.js';
import { getRecommendedCapabilities } from '../dist/wizard-policy.js';

const profiles = [
  'SCIENTIFIC_EVENT', 'CORPORATE_TRAINING', 'FAIR_EXHIBITION',
  'ENTERTAINMENT', 'SOCIAL_COMMUNITY', 'OTHER',
];

test('operação obedece à escolha ativa do organizador em cada perfil, sem concessão por perfil', () => {
  for (const profile of profiles) {
    const suggested = getRecommendedCapabilities(profile);
    const selected = enabledOperationalPermissions(['CHECK_IN', 'ACCREDITATION'], suggested);
    assert.equal(selected.includes('CHECK_IN'), suggested.includes('access_control'), profile);
    assert.equal(selected.includes('ACCREDITATION'), suggested.includes('credential'), profile);

    assert.deepEqual(enabledOperationalPermissions(['CHECK_IN', 'ACCREDITATION'], []), [], profile);
    assert.deepEqual(enabledOperationalPermissions(['CHECK_IN', 'ACCREDITATION'], ['credential']), ['ACCREDITATION'], profile);
    assert.deepEqual(enabledOperationalPermissions(['CHECK_IN', 'ACCREDITATION'], ['access_control']), ['CHECK_IN'], profile);
    assert.deepEqual(enabledOperationalPermissions(['BADGE_PRINT', 'KIOSK_OPERATE'], ['credential']), [], profile);
  }
});
