import assert from 'node:assert/strict';
import test from 'node:test';
import { EventFormat, EventProfileCode, RegistrationMode } from '@prisma/client';
import {
  getRecommendedCapabilities,
  getWizardCompletion,
  getWizardCompletionIssues,
  inferEventProfileCode,
  normalizeWizardAnswers,
} from '../dist/wizard-policy.js';

test('infere o perfil canônico de eventos técnico-científicos', () => {
  assert.equal(
    inferEventProfileCode('Congresso ou evento científico'),
    EventProfileCode.SCIENTIFIC_EVENT,
  );
  assert.equal(
    inferEventProfileCode('Simpósio Brasileiro de Cardiologia'),
    EventProfileCode.SCIENTIFIC_EVENT,
  );
  assert.equal(
    inferEventProfileCode('Jornada acadêmica'),
    EventProfileCode.SCIENTIFIC_EVENT,
  );
  assert.equal(
    inferEventProfileCode('Conferência técnica de pesquisa'),
    EventProfileCode.SCIENTIFIC_EVENT,
  );
});

test('prioriza marcadores explícitos e evita inferência científica excessiva', () => {
  assert.equal(
    inferEventProfileCode('Conferência corporativa anual'),
    EventProfileCode.CORPORATE_TRAINING,
  );
  assert.equal(
    inferEventProfileCode('Seminário'),
    EventProfileCode.OTHER,
  );
});

test('recomenda capabilities conforme o perfil científico canônico', () => {
  const result = getRecommendedCapabilities(
    EventProfileCode.SCIENTIFIC_EVENT,
    RegistrationMode.FREE,
  );

  assert.ok(result.includes('registration'));
  assert.ok(result.includes('scientific_submission'));
  assert.ok(result.includes('certificate'));
  assert.ok(result.includes('credential'));
  assert.ok(result.includes('access_control'));
  assert.equal(result.includes('exhibitor'), false);
});

test('pagamentos entram automaticamente quando a inscrição é paga', () => {
  const result = getRecommendedCapabilities(
    EventProfileCode.ENTERTAINMENT,
    RegistrationMode.PAID,
  );

  assert.ok(result.includes('payment'));
  assert.ok(result.includes('access_control'));
});

test('normalização converte o texto legado para profileCode', () => {
  const answers = normalizeWizardAnswers({
    eventType: 'Seminário científico',
    registrationMode: RegistrationMode.FREE,
  });

  assert.equal(answers.profileCode, EventProfileCode.SCIENTIFIC_EVENT);
  assert.ok(answers.capabilities.includes('scientific_submission'));
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
