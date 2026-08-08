import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScientificInvitationStatus,
  ScientificParticipationType,
} from '@prisma/client';
import {
  invitationCanBeMarkedSent,
  invitationCanBePrepared,
  invitationCanReceiveResponse,
  invitationTokenHash,
  participationTypeLabels,
  renderScientificInvitationTemplate,
} from '../dist/scientific-guests-policy.js';

test('mapeia funções científicas para rótulos em português', () => {
  assert.equal(participationTypeLabels[ScientificParticipationType.SPEAKER], 'Palestrante');
  assert.equal(participationTypeLabels[ScientificParticipationType.SESSION_CHAIR], 'Coordenador de sessão');
});

test('hash do token é determinístico e não expõe o token original', () => {
  const token = 'convite-super-seguro-1234567890';
  const first = invitationTokenHash(token);
  const second = invitationTokenHash(token);
  assert.equal(first, second);
  assert.notEqual(first, token);
  assert.equal(first.length, 64);
});

test('renderiza apenas as tags públicas aprovadas do convite', () => {
  const rendered = renderScientificInvitationTemplate(
    'Olá {NOME}, convite para {EVENTO} como {FUNCAO}.',
    { name: 'Ana Silva', event: 'Congresso Evolvia', role: 'Palestrante' },
  );
  assert.equal(rendered, 'Olá Ana Silva, convite para Congresso Evolvia como Palestrante.');
});

test('convite preparado pode ser marcado como enviado', () => {
  assert.equal(invitationCanBeMarkedSent(ScientificInvitationStatus.PREPARED), true);
  assert.equal(invitationCanBeMarkedSent(ScientificInvitationStatus.DRAFT), false);
});

test('resposta pública aceita somente estados ativos do convite', () => {
  assert.equal(invitationCanReceiveResponse(ScientificInvitationStatus.PREPARED), true);
  assert.equal(invitationCanReceiveResponse(ScientificInvitationStatus.SENT), true);
  assert.equal(invitationCanReceiveResponse(ScientificInvitationStatus.VIEWED), true);
  assert.equal(invitationCanReceiveResponse(ScientificInvitationStatus.CONFIRMED), false);
  assert.equal(invitationCanReceiveResponse(ScientificInvitationStatus.CANCELLED), false);
});

test('convite recusado pode ser preparado novamente, confirmado não', () => {
  assert.equal(invitationCanBePrepared(ScientificInvitationStatus.DECLINED), true);
  assert.equal(invitationCanBePrepared(ScientificInvitationStatus.CONFIRMED), false);
});
