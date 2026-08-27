import assert from 'node:assert/strict';
import test from 'node:test';
import { EventProfileCode } from '@prisma/client';
import {
  inferEventProfileCode,
  normalizeWizardAnswers,
} from '../dist/wizard-policy.js';

test('reconhece rótulos específicos sem criar novos perfis canônicos', () => {
  assert.equal(inferEventProfileCode('Convenção anual de vendas'), EventProfileCode.CORPORATE_TRAINING);
  assert.equal(inferEventProfileCode('Workshop de liderança'), EventProfileCode.CORPORATE_TRAINING);
  assert.equal(inferEventProfileCode('Congresso Brasileiro de Cardiologia'), EventProfileCode.SCIENTIFIC_EVENT);
  assert.equal(inferEventProfileCode('Festival de música'), EventProfileCode.ENTERTAINMENT);
  assert.equal(inferEventProfileCode('Feira de negócios'), EventProfileCode.FAIR_EXHIBITION);
});

test('normaliza público estimado sem transformá-lo em capacidade obrigatória', () => {
  const answers = normalizeWizardAnswers({
    eventType: 'Congresso científico',
    estimatedAudience: '850',
  });

  assert.equal(answers.estimatedAudience, 850);
  assert.equal(answers.audiencePending, false);
});

test('permite definir público depois sem inventar quantidade', () => {
  const answers = normalizeWizardAnswers({
    eventType: 'Evento corporativo',
    estimatedAudience: null,
    audiencePending: true,
  });

  assert.equal(answers.estimatedAudience, null);
  assert.equal(answers.audiencePending, true);
});

test('descarta estimativas inválidas ou excessivas', () => {
  assert.equal(normalizeWizardAnswers({ estimatedAudience: 0 }).estimatedAudience, undefined);
  assert.equal(normalizeWizardAnswers({ estimatedAudience: 1_000_001 }).estimatedAudience, undefined);
  assert.equal(normalizeWizardAnswers({ estimatedAudience: '10 pessoas' }).estimatedAudience, undefined);
});

test('quantidade explícita prevalece sobre o marcador de pendência', () => {
  const answers = normalizeWizardAnswers({
    estimatedAudience: 2500,
    audiencePending: true,
  });

  assert.equal(answers.estimatedAudience, 2500);
  assert.equal(answers.audiencePending, false);
});
