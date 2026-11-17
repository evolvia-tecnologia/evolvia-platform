import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ParticipantAreaPolicyError,
  normalizeParticipantAccess,
  normalizeParticipantToken,
  participantHash,
  secureHashMatches,
} from '../src/participant-area-policy.ts';

test('normaliza protocolo e documento sem preservar formatação de PII', () => {
  assert.deepEqual(normalizeParticipantAccess({ protocol: ' evo-ab12cd34ef56ab78 ', identityDocument: '529.982.247-25' }), {
    protocol: 'EVO-AB12CD34EF56AB78', identityDocument: '52998224725',
  });
});

test('rejeita protocolos e documentos fora do contrato', () => {
  for (const input of [{ protocol: 'EVO-1', identityDocument: '12345' }, { protocol: 'EVO-AB12CD34EF56AB78', identityDocument: '1' }, {}]) {
    assert.throws(() => normalizeParticipantAccess(input), ParticipantAreaPolicyError);
  }
});

test('rejeita CPF inválido e conteúdo inesperado antes de buscar a inscrição', () => {
  const protocol = 'EVO-AB12CD34EF56AB78';
  for (const identityDocument of ['123.456.789-00', '111.111.111-11', '12345678901', "' OR 1=1 --", '<script>alert(1)</script>']) {
    assert.throws(() => normalizeParticipantAccess({ protocol, identityDocument }), ParticipantAreaPolicyError);
  }
  assert.equal(normalizeParticipantAccess({ protocol, identityDocument: 'DOC-AB12CD34' }).identityDocument, 'DOCAB12CD34');
});

test('aceita somente bearer opaco de 256 bits', () => {
  const token = 'a'.repeat(64);
  assert.equal(normalizeParticipantToken(`Bearer ${token}`), token);
  for (const value of [undefined, token, `bearer ${token}`, 'Bearer curto']) assert.throws(() => normalizeParticipantToken(value));
});

test('compara hashes em tempo constante e falha fechado em entradas inválidas', () => {
  const hash = participantHash('52998224725');
  assert.equal(hash.length, 64);
  assert.equal(secureHashMatches(hash, participantHash('52998224725')), true);
  assert.equal(secureHashMatches(hash, participantHash('98765432100')), false);
  assert.equal(secureHashMatches(hash, 'inválido'), false);
});
