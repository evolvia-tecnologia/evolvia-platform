import assert from 'node:assert/strict';
import test from 'node:test';
import { EventFormat, RegistrationMode } from '@prisma/client';
import {
  getRecommendedCapabilities,
  getWizardCompletion,
  getWizardCompletionIssues,
  normalizeWizardAnswers,
} from '../dist/wizard-policy.js';

test('recomenda capabilities conforme o perfil científico', () => {
  const result = getRecommendedCapabilities(
    'Congresso ou evento científico',
    RegistrationMode.FREE,
  );

  assert.ok(result.includes('registration'));
  assert.ok(result.includes('scientific_submission'));
  assert.ok(result.includes('certificate'));
  assert.ok(result.includes('credential'));
  assert.equal(result.includes('exhibitor'), false);
});

test('pagamentos entram automaticamente quando a inscrição é paga', () => {
  const result = getRecommendedCapabilities(
    'Show ou entretenimento',
    RegistrationMode.PAID,
  );

  assert.ok(result.includes('payment'));
  assert.ok(result.includes('access_control'));
});

test('inscrições continuam obrigatórias mesmo após customização', () => {
  const answers = normalizeWizardAnswers({
    eventType: 'Outro tipo de evento',
    capabilitiesCustomized: true,
    capabilities: ['communication', 'codigo-invalido'],
  });

  assert.deepEqual(answers.capabilities, ['registration', 'communication']);
});

test('calcula progresso no backend e limita sessão ativa a 92%', () => {
  const answers = normalizeWizardAnswers({
    eventType: 'Evento corporativo ou treinamento',
    format: EventFormat.IN_PERSON,
    name: 'Convenção Evolvia',
    datesPending: true,
    venuePending: true,
    registrationMode: RegistrationMode.INVITATION,
    capabilitiesCustomized: false,
  });

  assert.equal(getWizardCompletion(answers), 92);
  assert.deepEqual(getWizardCompletionIssues(answers), []);
});

test('impede conclusão com datas invertidas', () => {
  const answers = normalizeWizardAnswers({
    eventType: 'Feira ou exposição',
    format: EventFormat.IN_PERSON,
    name: 'Feira Evolvia',
    startDate: '2026-08-10T12:00:00.000Z',
    endDate: '2026-08-09T12:00:00.000Z',
    venue: 'Centro de Convenções',
    registrationMode: RegistrationMode.FREE,
  });

  assert.ok(
    getWizardCompletionIssues(answers).includes(
      'A data de término não pode ser anterior à data de início.',
    ),
  );
});
