import assert from 'node:assert/strict';
import test from 'node:test';
import { canMutateEventPublication, canTransitionEventPublication } from '../dist/event-publication/event-publication.policy.js';

const mutatingRoles = ['OWNER', 'ADMIN', 'MANAGER'];
const nonMutatingRoles = ['OPERATOR', 'VIEWER'];
const editableStatuses = ['DRAFT', 'SETUP'];
const frozenStatuses = ['HOMOLOGATION', 'READY_TO_PUBLISH'];
const lockedStatuses = ['PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED'];
const editorialMutations = ['UPDATE_EDITORIAL', 'UPDATE_SECTIONS', 'UPDATE_THEME'];

test('nega por padrão papéis sem permissão editorial', () => {
  for (const role of nonMutatingRoles) {
    for (const eventStatus of [...editableStatuses, ...frozenStatuses, ...lockedStatuses]) {
      for (const mutation of [...editorialMutations, 'PREPARE_PREVIEW']) {
        assert.equal(
          canMutateEventPublication({ role, eventStatus, mutation }),
          false,
          `${role} não deveria executar ${mutation} em ${eventStatus}`,
        );
      }
    }
  }
});

test('OWNER, ADMIN e MANAGER editam somente DRAFT e SETUP', () => {
  for (const role of mutatingRoles) {
    for (const eventStatus of editableStatuses) {
      for (const mutation of editorialMutations) {
        assert.equal(
          canMutateEventPublication({ role, eventStatus, mutation }),
          true,
          `${role} deveria executar ${mutation} em ${eventStatus}`,
        );
      }
    }

    for (const eventStatus of [...frozenStatuses, ...lockedStatuses]) {
      for (const mutation of editorialMutations) {
        assert.equal(
          canMutateEventPublication({ role, eventStatus, mutation }),
          false,
          `${role} não deveria executar ${mutation} em ${eventStatus}`,
        );
      }
    }
  }
});

test('homologação e pronto para publicar congelam mutações editoriais', () => {
  for (const role of mutatingRoles) {
    for (const eventStatus of frozenStatuses) {
      for (const mutation of editorialMutations) {
        assert.equal(
          canMutateEventPublication({ role, eventStatus, mutation }),
          false,
          `${eventStatus} deve exigir regressão explícita de estado antes de ${mutation}`,
        );
      }
    }
  }
});

test('preview é permitido aos papéis mutantes em estados não cancelados', () => {
  const previewableStatuses = [
    'DRAFT',
    'SETUP',
    'HOMOLOGATION',
    'READY_TO_PUBLISH',
    'PUBLISHED',
    'SUSPENDED',
    'FINISHED',
  ];

  for (const role of mutatingRoles) {
    for (const eventStatus of previewableStatuses) {
      assert.equal(
        canMutateEventPublication({ role, eventStatus, mutation: 'PREPARE_PREVIEW' }),
        true,
        `${role} deveria preparar preview em ${eventStatus}`,
      );
    }
  }
});

test('evento cancelado bloqueia inclusive preparação de preview', () => {
  for (const role of mutatingRoles) {
    assert.equal(
      canMutateEventPublication({ role, eventStatus: 'CANCELLED', mutation: 'PREPARE_PREVIEW' }),
      false,
    );
  }
});

test('mutação desconhecida não ganha permissão por inferência', () => {
  assert.equal(
    canMutateEventPublication({ role: 'OWNER', eventStatus: 'DRAFT', mutation: 'UNKNOWN_MUTATION' }),
    false,
  );
});

test('MANAGER pode enviar para homologação e devolver para ajustes, mas não aprovar nem publicar', () => {
  assert.equal(canTransitionEventPublication({ role: 'MANAGER', fromStatus: 'SETUP', toStatus: 'HOMOLOGATION' }), true);
  assert.equal(canTransitionEventPublication({ role: 'MANAGER', fromStatus: 'HOMOLOGATION', toStatus: 'SETUP' }), true);
  assert.equal(canTransitionEventPublication({ role: 'MANAGER', fromStatus: 'HOMOLOGATION', toStatus: 'READY_TO_PUBLISH' }), false);
  assert.equal(canTransitionEventPublication({ role: 'MANAGER', fromStatus: 'READY_TO_PUBLISH', toStatus: 'PUBLISHED' }), false);
});

test('OWNER e ADMIN aprovam homologação e publicam somente pela sequência canônica', () => {
  for (const role of ['OWNER', 'ADMIN']) {
    assert.equal(canTransitionEventPublication({ role, fromStatus: 'SETUP', toStatus: 'HOMOLOGATION' }), true);
    assert.equal(canTransitionEventPublication({ role, fromStatus: 'HOMOLOGATION', toStatus: 'READY_TO_PUBLISH' }), true);
    assert.equal(canTransitionEventPublication({ role, fromStatus: 'READY_TO_PUBLISH', toStatus: 'PUBLISHED' }), true);
    assert.equal(canTransitionEventPublication({ role, fromStatus: 'SETUP', toStatus: 'PUBLISHED' }), false);
    assert.equal(canTransitionEventPublication({ role, fromStatus: 'PUBLISHED', toStatus: 'SETUP' }), false);
  }
});

test('OPERATOR e VIEWER não avançam nem regridem a publicação', () => {
  for (const role of ['OPERATOR', 'VIEWER']) {
    for (const [fromStatus, toStatus] of [
      ['SETUP', 'HOMOLOGATION'],
      ['HOMOLOGATION', 'SETUP'],
      ['HOMOLOGATION', 'READY_TO_PUBLISH'],
      ['READY_TO_PUBLISH', 'PUBLISHED'],
    ]) {
      assert.equal(canTransitionEventPublication({ role, fromStatus, toStatus }), false);
    }
  }
});
