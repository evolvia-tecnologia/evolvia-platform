import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessTotemAccess,
  mergeTotemLink,
  totemAccessDecision,
  normalizeTotemExpiry,
  readTotemLink,
  TotemLinkPolicyError,
  totemLinkHash,
  totemLinkView,
} from '../src/totem-link-policy.ts';

const now = new Date('2026-10-04T15:00:00.000Z');

function record(expiresAt, token = 'a'.repeat(64)) {
  return {
    tokenHash: totemLinkHash(token),
    expiresAt,
    issuedAt: now.toISOString(),
  };
}

test('a validade do totem fica entre 30 minutos e 90 dias', () => {
  const accepted = normalizeTotemExpiry({ expiresAt: '2026-10-11T15:00:00.000Z' }, now);
  assert.equal(accepted.toISOString(), '2026-10-11T15:00:00.000Z');
  assert.throws(() => normalizeTotemExpiry({ expiresAt: '2026-10-04T15:20:00.000Z' }, now), TotemLinkPolicyError);
  assert.throws(() => normalizeTotemExpiry({ expiresAt: '2027-02-04T15:00:00.000Z' }, now), TotemLinkPolicyError);
  assert.throws(() => normalizeTotemExpiry({ expiresAt: '2026-10-11T15:00:00.000Z', token: 'a' }, now), TotemLinkPolicyError);
  assert.throws(() => normalizeTotemExpiry({ days: 7 }, now), TotemLinkPolicyError);
});

test('o painel mostra a validade sem o segredo, e um link novo apaga o anterior', () => {
  const current = { selfService: { cpf: true }, label: { showName: true }, totemLink: record('2026-10-05T15:00:00.000Z') };
  assert.deepEqual(totemLinkView(current, now), { state: 'active', expiresAt: '2026-10-05T15:00:00.000Z' });
  assert.equal(readTotemLink(current)?.tokenHash, totemLinkHash('a'.repeat(64)));
  assert.deepEqual(totemLinkView({ totemLink: record('2026-10-04T14:00:00.000Z') }, now), {
    state: 'expired',
    expiresAt: '2026-10-04T14:00:00.000Z',
  });
  assert.deepEqual(totemLinkView({ totemLink: { tokenHash: 'curto', expiresAt: now.toISOString(), issuedAt: now.toISOString() } }, now), {
    state: 'absent',
    expiresAt: null,
  });

  const replaced = mergeTotemLink(current, record('2026-10-20T15:00:00.000Z', 'b'.repeat(64)));
  assert.equal(replaced.selfService.cpf, true);
  assert.equal(replaced.label.showName, true);
  assert.equal(replaced.totemLink.tokenHash, totemLinkHash('b'.repeat(64)));
  assert.deepEqual(mergeTotemLink(replaced, null), { selfService: { cpf: true }, label: { showName: true } });
});

test('só o token vigente abre o autoatendimento', () => {
  const token = 'c'.repeat(64);
  const config = { totemLink: record('2026-10-05T15:00:00.000Z', token) };
  assert.equal(assessTotemAccess(config, token, now), 'valid');
  assert.equal(assessTotemAccess(config, 'd'.repeat(64), now), 'rejected');
  assert.equal(assessTotemAccess(config, token.slice(0, 63), now), 'rejected');
  assert.equal(assessTotemAccess({ totemLink: record('2026-10-04T14:00:00.000Z', token) }, token, now), 'expired');
  assert.equal(assessTotemAccess({}, token, now), 'rejected');
});

test('link vigente ou vencido não abre quando o token é omitido', () => {
  const token = 'c'.repeat(64);
  const active = { totemLink: record('2026-10-05T15:00:00.000Z', token) };
  const expired = { totemLink: record('2026-10-04T14:00:00.000Z', token) };
  assert.equal(totemAccessDecision(active, token, now), 'valid');
  assert.equal(totemAccessDecision(active, undefined, now), 'rejected');
  assert.equal(totemAccessDecision(active, '', now), 'rejected');
  assert.equal(totemAccessDecision(active, '   ', now), 'rejected');
  assert.equal(totemAccessDecision(expired, token, now), 'expired');
  assert.equal(totemAccessDecision(expired, undefined, now), 'rejected');
  assert.equal(totemAccessDecision({ selfService: { cpf: true } }, undefined, now), 'open');
  assert.equal(totemAccessDecision({ selfService: { cpf: true } }, token, now), 'open');
  assert.equal(totemAccessDecision({ selfService: { cpf: true } }, '', now), 'open');
});
