import assert from 'node:assert/strict';
import test from 'node:test';
import { EventFormat, EventProfileCode, RegistrationMode } from '@prisma/client';
import {
  CANONICAL_EVENT_TYPE_PROFILES,
  getRecommendedCapabilities,
  getRequiredCapabilities,
  getWizardCompletion,
  getWizardCompletionIssues,
  inferEventProfileCode,
  normalizeWizardAnswers,
  parseSubjectAreas,
} from '../dist/wizard-policy.js';

const CATALOG_CASES = [
  { eventType: 'Congresso ou evento científico', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Simpósio científico', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Jornada científica', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Seminário acadêmico', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Conferência científica', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Evento corporativo ou treinamento', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Convenção empresarial', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Treinamento', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Workshop', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Curso ou palestra', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Networking ou meetup', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Feira ou exposição', profileCode: EventProfileCode.FAIR_EXHIBITION },
  { eventType: 'Exposição', profileCode: EventProfileCode.FAIR_EXHIBITION },
  { eventType: 'Show ou entretenimento', profileCode: EventProfileCode.ENTERTAINMENT },
  { eventType: 'Festival', profileCode: EventProfileCode.ENTERTAINMENT },
  { eventType: 'Evento social ou comunitário', profileCode: EventProfileCode.SOCIAL_COMMUNITY },
  { eventType: 'Evento religioso ou beneficente', profileCode: EventProfileCode.SOCIAL_COMMUNITY },
  { eventType: 'Evento esportivo ou torneio', profileCode: EventProfileCode.SOCIAL_COMMUNITY },
  { eventType: 'Corrida', profileCode: EventProfileCode.SOCIAL_COMMUNITY },
  { eventType: 'Outro tipo de evento', profileCode: EventProfileCode.OTHER },
];

const STRUCTURAL_CAPABILITIES = {
  [EventProfileCode.SCIENTIFIC_EVENT]: ['registration', 'scientific_submission'],
  [EventProfileCode.CORPORATE_TRAINING]: ['registration', 'certificate'],
  [EventProfileCode.FAIR_EXHIBITION]: ['registration', 'exhibitor'],
  [EventProfileCode.ENTERTAINMENT]: ['registration', 'access_control'],
  [EventProfileCode.SOCIAL_COMMUNITY]: ['registration'],
  [EventProfileCode.OTHER]: ['registration'],
};

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

test('cataloga exatamente os 20 tipos aprovados sem duplicar família', () => {
  assert.equal(CATALOG_CASES.length, 20);
  assert.equal(CANONICAL_EVENT_TYPE_PROFILES.length, 20);
  assert.equal(new Set(CATALOG_CASES.map((item) => item.eventType)).size, 20);
  assert.deepEqual(
    [...new Set(CATALOG_CASES.map((item) => item.profileCode))].sort(),
    [
      EventProfileCode.CORPORATE_TRAINING,
      EventProfileCode.ENTERTAINMENT,
      EventProfileCode.FAIR_EXHIBITION,
      EventProfileCode.OTHER,
      EventProfileCode.SCIENTIFIC_EVENT,
      EventProfileCode.SOCIAL_COMMUNITY,
    ],
  );
});

test('infere a família canônica de cada um dos 20 tipos do catálogo', () => {
  for (const item of CATALOG_CASES) {
    assert.equal(
      inferEventProfileCode(item.eventType),
      item.profileCode,
      item.eventType,
    );
  }
});

test('recomenda capabilities estruturais para os 20 tipos, com pagamento só quando a inscrição é paga', () => {
  for (const item of CATALOG_CASES) {
    const free = getRecommendedCapabilities(item.profileCode, RegistrationMode.FREE, item.eventType);
    const paid = getRecommendedCapabilities(item.profileCode, RegistrationMode.PAID, item.eventType);
    const structural = STRUCTURAL_CAPABILITIES[item.profileCode];
    const expectsMaterial = item.profileCode === EventProfileCode.CORPORATE_TRAINING || item.eventType === 'Corrida';

    for (const code of structural) {
      assert.ok(free.includes(code), `${item.eventType} deve incluir ${code}`);
    }

    assert.equal(
      free.includes('material_delivery'),
      expectsMaterial,
      `${item.eventType} ${expectsMaterial ? 'deve' : 'não deve'} recomendar entrega de material`,
    );
    assert.equal(free.includes('payment'), false, `${item.eventType} gratuito não recomenda pagamento`);
    assert.ok(paid.includes('payment'), `${item.eventType} pago recomenda pagamento`);
    assert.ok(paid.includes('registration'), `${item.eventType} pago mantém inscrição`);
    assert.equal(paid.includes('material_delivery'), expectsMaterial, item.eventType);
  }
});

test('inscrição é obrigatória para qualquer perfil; acesso é estrutural só em entretenimento', () => {
  for (const profileCode of Object.values(EventProfileCode)) {
    const required = getRequiredCapabilities(profileCode);
    assert.ok(required.includes('registration'), profileCode);

    if (profileCode === EventProfileCode.ENTERTAINMENT) {
      assert.deepEqual(required, ['registration', 'access_control']);
    } else {
      assert.deepEqual(required, ['registration']);
    }
  }
});

test('texto arbitrário não é reclassificado por fragmento científico isolado', () => {
  for (const eventType of ['Seminário', 'Conferência', 'Jornada', 'Encontro', 'Fórum', 'Semana']) {
    assert.equal(inferEventProfileCode(eventType), EventProfileCode.OTHER, eventType);
  }
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

test('customização de entretenimento não remove o controle de acesso estrutural', () => {
  for (const eventType of ['Show ou entretenimento', 'Festival']) {
    const answers = normalizeWizardAnswers({
      eventType,
      registrationMode: RegistrationMode.PAID,
      capabilitiesCustomized: true,
      capabilities: ['registration', 'payment', 'communication'],
    });

    assert.equal(answers.profileCode, EventProfileCode.ENTERTAINMENT, eventType);
    assert.ok(answers.capabilities.includes('registration'), eventType);
    assert.ok(answers.capabilities.includes('access_control'), eventType);
    assert.ok(answers.capabilities.includes('payment'), eventType);
    assert.equal(
      getWizardCompletionIssues(answers).includes(
        'Controle de acesso é obrigatório para eventos de show ou entretenimento.',
      ),
      false,
      eventType,
    );
  }
});

test('Corrida sugere entrega de material sem torná-la obrigatória e preserva a desativação', () => {
  const started = normalizeWizardAnswers({
    eventType: 'Corrida',
    registrationMode: RegistrationMode.FREE,
    capabilitiesCustomized: false,
  });
  assert.equal(started.profileCode, EventProfileCode.SOCIAL_COMMUNITY);
  assert.equal(started.capabilitiesCustomized, false);
  assert.ok(started.capabilities.includes('material_delivery'));
  assert.ok(started.capabilities.includes('registration'));
  assert.equal(getRequiredCapabilities(EventProfileCode.SOCIAL_COMMUNITY).includes('material_delivery'), false);

  const reopened = normalizeWizardAnswers({
    eventType: ' Corrida ',
    profileCode: EventProfileCode.SOCIAL_COMMUNITY,
    registrationMode: RegistrationMode.FREE,
    capabilitiesCustomized: false,
    capabilities: ['registration', 'communication', 'credential'],
  });
  assert.ok(reopened.capabilities.includes('material_delivery'));

  const customized = normalizeWizardAnswers({
    eventType: 'Corrida',
    registrationMode: RegistrationMode.FREE,
    capabilitiesCustomized: true,
    capabilities: ['communication'],
  });
  assert.equal(customized.capabilitiesCustomized, true);
  assert.deepEqual(customized.capabilities, ['registration', 'communication']);
  assert.equal(customized.capabilities.includes('material_delivery'), false);

  for (const eventType of ['Evento social ou comunitário', 'Evento religioso ou beneficente', 'Evento esportivo ou torneio']) {
    const answers = normalizeWizardAnswers({
      eventType,
      registrationMode: RegistrationMode.FREE,
      capabilitiesCustomized: false,
    });
    assert.equal(answers.profileCode, EventProfileCode.SOCIAL_COMMUNITY, eventType);
    assert.equal(answers.capabilities.includes('material_delivery'), false, eventType);
  }

  const corporate = normalizeWizardAnswers({
    eventType: 'Treinamento',
    registrationMode: RegistrationMode.FREE,
    capabilitiesCustomized: false,
  });
  assert.ok(corporate.capabilities.includes('material_delivery'));

  const looseLabel = normalizeWizardAnswers({
    eventType: 'corrida de rua',
    registrationMode: RegistrationMode.FREE,
    capabilitiesCustomized: false,
  });
  assert.equal(looseLabel.profileCode, EventProfileCode.OTHER);
  assert.equal(looseLabel.capabilities.includes('material_delivery'), false);
});

test('outros perfis continuam livres para não usar controle de acesso', () => {
  const answers = normalizeWizardAnswers({
    eventType: 'Evento social ou comunitário',
    registrationMode: RegistrationMode.FREE,
    capabilitiesCustomized: true,
    capabilities: ['communication'],
  });

  assert.equal(answers.profileCode, EventProfileCode.SOCIAL_COMMUNITY);
  assert.deepEqual(answers.capabilities, ['registration', 'communication']);
  assert.equal(answers.capabilities.includes('access_control'), false);
});

test('respostas de entretenimento sem acesso permanecem incompletas', () => {
  const issues = getWizardCompletionIssues({
    eventType: 'Festival',
    profileCode: EventProfileCode.ENTERTAINMENT,
    capabilities: ['registration', 'communication'],
  });

  assert.ok(
    issues.includes('Controle de acesso é obrigatório para eventos de show ou entretenimento.'),
  );
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
    timeZone: 'America/Sao_Paulo',
    venuePending: true,
    registrationMode: RegistrationMode.INVITATION,
    capabilitiesCustomized: false,
    subjectAreas: ['negocios', 'negocios', 'inexistente'],
  });

  assert.deepEqual(answers.subjectAreas, ['negocios']);
  assert.equal(getWizardCompletion(answers), 92);
  assert.deepEqual(getWizardCompletionIssues(answers), []);
});

test('área de atuação é obrigatória e limitada ao catálogo público', () => {
  const missing = normalizeWizardAnswers({
    eventType: 'Congresso ou evento científico',
    format: EventFormat.IN_PERSON,
    name: 'Congresso de Cardiologia',
    datesPending: true,
    timeZone: 'America/Sao_Paulo',
    venuePending: true,
    registrationMode: RegistrationMode.PAID,
  });
  assert.deepEqual(missing.subjectAreas, []);
  assert.ok(getWizardCompletionIssues(missing).includes('Escolha ao menos uma área de atuação.'));
  assert.ok(getWizardCompletion(missing) < 92);

  const chosen = normalizeWizardAnswers({ ...missing, subjectAreas: ['saude', 'educacao', 'direito', 'tecnologia'] });
  assert.deepEqual(chosen.subjectAreas, ['saude', 'educacao', 'direito']);
  assert.equal(getWizardCompletionIssues(chosen).includes('Escolha ao menos uma área de atuação.'), false);
});

test('escrita direta da área deduplica e recusa o que o Wizard apenas descartaria', () => {
  assert.deepEqual(parseSubjectAreas(['saude', 'saude', 'direito']), { subjectAreas: ['saude', 'direito'] });
  assert.deepEqual(parseSubjectAreas(['saude', 'educacao', 'direito', 'saude']), {
    subjectAreas: ['saude', 'educacao', 'direito'],
  });
  for (const value of [undefined, null, 'saude', {}, [], ['futebol'], ['saude', 1], ['saude', 'educacao', 'direito', 'tecnologia']]) {
    assert.ok('error' in parseSubjectAreas(value), JSON.stringify(value));
  }
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


test('normaliza timezone IANA e impede conclusão sem confirmação do organizador', () => {
  const valid = normalizeWizardAnswers({
    eventType: 'Outro tipo de evento',
    format: EventFormat.ONLINE,
    name: 'Encontro internacional',
    datesPending: true,
    timeZone: ' America/Manaus ',
    venuePending: true,
    registrationMode: RegistrationMode.FREE,
  });
  assert.equal(valid.timeZone, 'America/Manaus');
  assert.equal(getWizardCompletionIssues(valid).includes('Escolha o fuso horário do evento.'), false);

  const invalid = normalizeWizardAnswers({ ...valid, timeZone: '-03:00' });
  assert.equal(invalid.timeZone, undefined);
  assert.ok(getWizardCompletionIssues(invalid).includes('Escolha o fuso horário do evento.'));
});

test('string vazia em data vira null explícito; inválida continua omitida', () => {
  const cleared = normalizeWizardAnswers({
    eventType: 'Outro tipo de evento',
    startDate: '2026-10-16T12:00:00.000Z',
    endDate: '',
  });
  assert.equal(cleared.endDate, null);
  assert.equal(cleared.startDate, '2026-10-16T12:00:00.000Z');

  const blank = normalizeWizardAnswers({ endDate: '   ' });
  assert.equal(blank.endDate, null);

  const invalid = normalizeWizardAnswers({ endDate: 'não-é-data' });
  assert.equal(invalid.endDate, undefined);
});
