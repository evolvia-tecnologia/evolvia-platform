import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicationEvaGuidance } from '../dist/event-publication/event-publication-eva-guidance.js';

const completeChecklist = [
  { code: 'EVENT_NAME', label: 'Nome público do evento', ready: true, required: true },
  { code: 'PUBLIC_CONTACT', label: 'Contato público', ready: true, required: false },
];

const ownerPermissions = {
  canEdit: true,
  canPreparePreview: true,
  canSubmitForHomologation: true,
  canReturnToSetup: false,
  canApproveHomologation: false,
  canPublish: false,
};

test('EVA indica bloqueios reais e aponta o editor sem executar ação', () => {
  const result = buildPublicationEvaGuidance({
    status: 'SETUP',
    checklist: [
      { code: 'SHORT_DESCRIPTION', label: 'Descrição curta', ready: false, required: true },
      { code: 'PUBLIC_CONTACT', label: 'Contato público', ready: false, required: false },
    ],
    permissions: { ...ownerPermissions, canSubmitForHomologation: false },
  });

  assert.equal(result.scope, 'EVENT_PUBLICATION');
  assert.equal(result.pendingItems.length, 2);
  assert.equal(result.pendingItems[0].priority, 'BLOCKING');
  assert.equal(result.nextStep.code, 'EDIT_REQUIRED');
  assert.equal(result.nextStep.targetId, 'publication-form');
});

test('EVA direciona dados canônicos como timezone para a configuração do evento', () => {
  const result = buildPublicationEvaGuidance({
    status: 'SETUP',
    checklist: [
      { code: 'EVENT_TIME_ZONE', label: 'Fuso horário do evento', ready: false, required: true },
      { code: 'SHORT_DESCRIPTION', label: 'Descrição curta', ready: false, required: true },
    ],
    permissions: { ...ownerPermissions, canSubmitForHomologation: false },
  });

  assert.equal(result.nextStep.code, 'COMPLETE_EVENT_SETUP');
  assert.equal(result.nextStep.targetId, 'event-configuration');
  assert.equal(result.pendingItems.some((item) => item.code === 'EVENT_TIME_ZONE'), true);
});
test('EVA segue a sequência canônica sem oferecer publicação direta em SETUP', () => {
  const result = buildPublicationEvaGuidance({
    status: 'SETUP',
    checklist: completeChecklist,
    permissions: ownerPermissions,
  });

  assert.equal(result.nextStep.code, 'SEND_TO_HOMOLOGATION');
  assert.match(result.publicationExplanation, /não é possível publicar diretamente/u);
});

test('EVA diferencia aprovação, espera e confirmação pelas permissões efetivas', () => {
  const manager = buildPublicationEvaGuidance({
    status: 'HOMOLOGATION',
    checklist: completeChecklist,
    permissions: {
      ...ownerPermissions,
      canEdit: false,
      canSubmitForHomologation: false,
      canReturnToSetup: true,
    },
  });
  const approver = buildPublicationEvaGuidance({
    status: 'HOMOLOGATION',
    checklist: completeChecklist,
    permissions: {
      ...ownerPermissions,
      canEdit: false,
      canSubmitForHomologation: false,
      canReturnToSetup: true,
      canApproveHomologation: true,
    },
  });
  const publisher = buildPublicationEvaGuidance({
    status: 'READY_TO_PUBLISH',
    checklist: completeChecklist,
    permissions: {
      ...ownerPermissions,
      canEdit: false,
      canSubmitForHomologation: false,
      canPublish: true,
    },
  });

  assert.equal(manager.nextStep.code, 'WAIT_FOR_APPROVAL');
  assert.equal(approver.nextStep.code, 'APPROVE_HOMOLOGATION');
  assert.equal(publisher.nextStep.code, 'CONFIRM_PUBLICATION');
  assert.match(publisher.nextStep.description, /EVA não executa/u);
});

test('EVA orienta retorno explícito quando o checklist congelado contém bloqueio', () => {
  const result = buildPublicationEvaGuidance({
    status: 'HOMOLOGATION',
    checklist: [{ code: 'EVENT_DATES', label: 'Datas do evento', ready: false, required: true }],
    permissions: {
      ...ownerPermissions,
      canEdit: false,
      canSubmitForHomologation: false,
      canReturnToSetup: true,
    },
  });

  assert.equal(result.nextStep.code, 'RETURN_TO_SETUP');
  assert.match(result.nextStep.description, /Gate/u);
});

test('orientação não inclui identidade, tenant, contato ou papel nominal', () => {
  const result = buildPublicationEvaGuidance({
    status: 'PUBLISHED',
    checklist: completeChecklist,
    permissions: {
      ...ownerPermissions,
      canEdit: false,
      canSubmitForHomologation: false,
    },
  });
  const serialized = JSON.stringify(result);

  for (const forbidden of ['organizationId', 'eventId', 'actorUserId', 'contato@evento.test', 'OWNER']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(result.nextStep.code, 'VIEW_PUBLISHED_PAGE');
});
