import assert from 'node:assert/strict';
import test from 'node:test';
import { canMutateEventPublication } from '../dist/event-publication/event-publication.policy.js';

const mutatingRoles = ['OWNER', 'ADMIN', 'MANAGER'];
const nonMutatingRoles = ['OPERATOR', 'VIEWER'];
const editableStatuses = ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH'];
const lockedStatuses = ['PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED'];
const editorialMutations = ['UPDATE_EDITORIAL', 'UPDATE_SECTIONS', 'UPDATE_THEME'];

test('nega por padrão papéis sem permissão editorial', () => {
  for (const role of nonMutatingRoles) {
    for (const eventStatus of [...editableStatuses, ...lockedStatuses]) {
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

test('OWNER, ADMIN e MANAGER podem editar somente estados editáveis', () => {
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

    for (const eventStatus of lockedStatuses) {
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
