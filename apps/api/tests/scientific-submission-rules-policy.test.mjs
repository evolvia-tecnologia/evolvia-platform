import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countScientificText,
  evaluateScientificSubmissionWindow,
  normalizeScientificTextForCounting,
  resolveScientificSubmissionRuleSet,
  validateScientificSubmissionForSubmit,
  validateScientificSubmissionRuleSet,
} from '../dist/scientific-submission-rules.policy.js';

const baseRules = {
  requireArea: true,
  requireSubarea: false,
  minAuthors: 1,
  maxAuthors: 8,
  minKeywords: 3,
  maxKeywords: 5,
  maxSubmissionsAsResponsible: 2,
  maxAuthorships: 5,
  maxPresentations: 2,
  contentMode: 'SINGLE_BLOCK',
  singleBlock: {
    required: true,
    count: { unit: 'WORDS', min: 4, max: 10 },
  },
  window: {
    startsAt: new Date('2026-08-01T03:00:00.000Z'),
    endsAt: new Date('2026-09-01T02:59:00.000Z'),
  },
};

test('normaliza espaços de forma determinística e conta palavras/caracteres Unicode', () => {
  assert.equal(normalizeScientificTextForCounting('  Olá   mundo\n científico  '), 'Olá mundo científico');
  assert.equal(countScientificText('  Olá   mundo\n científico  ', 'WORDS'), 3);
  assert.equal(countScientificText('  Olá   mundo  ', 'CHARACTERS'), 9);
  assert.equal(countScientificText('   \n\t ', 'WORDS'), 0);
});

test('regra de modalidade sobrescreve somente o necessário e preserva regra geral', () => {
  const resolved = resolveScientificSubmissionRuleSet(baseRules, {
    requireSubarea: true,
    maxAuthors: 4,
    maxKeywords: null,
    singleBlock: { count: { max: 6 } },
    window: { endsAt: new Date('2026-08-20T02:59:00.000Z') },
  });

  assert.equal(resolved.requireArea, true);
  assert.equal(resolved.requireSubarea, true);
  assert.equal(resolved.maxAuthors, 4);
  assert.equal(resolved.maxKeywords, null);
  assert.deepEqual(resolved.singleBlock.count, { unit: 'WORDS', min: 4, max: 6 });
  assert.equal(resolved.window.startsAt.toISOString(), '2026-08-01T03:00:00.000Z');
  assert.equal(resolved.window.endsAt.toISOString(), '2026-08-20T02:59:00.000Z');
});

test('valida configuração incoerente antes de disponibilizar o fluxo ao autor', () => {
  const errors = validateScientificSubmissionRuleSet({
    ...baseRules,
    minAuthors: 0,
    maxAuthors: 0,
    minKeywords: 5,
    maxKeywords: 2,
    maxAuthorships: 0,
    window: {
      startsAt: new Date('2026-08-20T00:00:00.000Z'),
      endsAt: new Date('2026-08-19T00:00:00.000Z'),
    },
    singleBlock: {
      required: true,
      count: { unit: 'WORDS', min: 100, max: 50 },
    },
  });

  const codes = errors.map((item) => item.code);
  assert.equal(codes.includes('INVALID_MIN_AUTHORS'), true);
  assert.equal(codes.includes('INVALID_AUTHOR_RANGE'), true);
  assert.equal(codes.includes('INVALID_KEYWORD_RANGE'), true);
  assert.equal(codes.includes('INVALID_QUOTA'), true);
  assert.equal(codes.includes('INVALID_WINDOW'), true);
  assert.equal(codes.includes('INVALID_TEXT_RANGE'), true);
});

test('janela usa intervalo semiaberto: abre no início e fecha exatamente no término', () => {
  const window = {
    startsAt: new Date('2026-08-10T12:00:00.000Z'),
    endsAt: new Date('2026-08-10T13:00:00.000Z'),
  };

  assert.equal(evaluateScientificSubmissionWindow(window, new Date('2026-08-10T11:59:59.999Z')), 'BEFORE');
  assert.equal(evaluateScientificSubmissionWindow(window, new Date('2026-08-10T12:00:00.000Z')), 'OPEN');
  assert.equal(evaluateScientificSubmissionWindow(window, new Date('2026-08-10T12:59:59.999Z')), 'OPEN');
  assert.equal(evaluateScientificSubmissionWindow(window, new Date('2026-08-10T13:00:00.000Z')), 'CLOSED');
});

test('bloco único exige área, autores, palavras-chave, conteúdo e respeita limites', () => {
  const errors = validateScientificSubmissionForSubmit(
    baseRules,
    {
      areaId: null,
      authorCount: 0,
      keywords: ['evento'],
      singleBlockText: 'texto curto',
    },
    new Date('2026-08-10T12:00:00.000Z'),
  );

  const codes = errors.map((item) => item.code);
  assert.equal(codes.includes('AREA_REQUIRED'), true);
  assert.equal(codes.includes('MIN_AUTHORS_NOT_MET'), true);
  assert.equal(codes.includes('MIN_KEYWORDS_NOT_MET'), true);
  assert.equal(codes.includes('CONTENT_MIN_NOT_MET'), true);
});

test('submissão completa em bloco único passa sem erros dentro da janela', () => {
  const errors = validateScientificSubmissionForSubmit(
    baseRules,
    {
      areaId: 'area-1',
      authorCount: 3,
      keywords: ['eventos', 'tecnologia', 'ciência'],
      singleBlockText: 'Objetivo método resultados e conclusão apresentados claramente',
      participantUsage: {
        responsibleSubmissions: 1,
        authorships: 3,
        presentations: 1,
        currentSubmissionCountsAsAuthorship: true,
        currentSubmissionCountsAsPresentation: true,
      },
    },
    new Date('2026-08-10T12:00:00.000Z'),
  );

  assert.deepEqual(errors, []);
});

test('limites por participante bloqueiam nova submissão/autoria/apresentação', () => {
  const errors = validateScientificSubmissionForSubmit(
    baseRules,
    {
      areaId: 'area-1',
      authorCount: 2,
      keywords: ['um', 'dois', 'três'],
      singleBlockText: 'Objetivo método resultados e conclusão',
      participantUsage: {
        responsibleSubmissions: 2,
        authorships: 5,
        presentations: 2,
        currentSubmissionCountsAsAuthorship: true,
        currentSubmissionCountsAsPresentation: true,
      },
    },
    new Date('2026-08-10T12:00:00.000Z'),
  );

  assert.deepEqual(errors.map((item) => item.code).filter((code) => code.endsWith('LIMIT_EXCEEDED')), [
    'RESPONSIBLE_SUBMISSION_LIMIT_EXCEEDED',
    'AUTHORSHIP_LIMIT_EXCEEDED',
    'PRESENTATION_LIMIT_EXCEEDED',
  ]);
});

test('conteúdo estruturado valida blocos individuais e limite global', () => {
  const rules = {
    ...baseRules,
    contentMode: 'STRUCTURED_BLOCKS',
    singleBlock: null,
    structuredBlocks: [
      { code: 'objective', label: 'Objetivo', sortOrder: 1, required: true, count: { unit: 'WORDS', min: 2, max: 5 } },
      { code: 'methods', label: 'Metodologia', sortOrder: 2, required: true, count: { unit: 'WORDS', min: 2, max: 5 } },
      { code: 'results', label: 'Resultados', sortOrder: 3, required: false, count: { unit: 'WORDS', max: 5 } },
    ],
    globalContentCount: { unit: 'WORDS', max: 8 },
  };

  assert.deepEqual(validateScientificSubmissionRuleSet(rules), []);

  const errors = validateScientificSubmissionForSubmit(
    rules,
    {
      areaId: 'area-1',
      authorCount: 2,
      keywords: ['um', 'dois', 'três'],
      structuredContent: {
        objective: 'Avaliar resultados',
        methods: '',
        results: 'Resultados relevantes foram observados claramente',
      },
    },
    new Date('2026-08-10T12:00:00.000Z'),
  );

  const codes = errors.map((item) => item.code);
  assert.equal(codes.includes('CONTENT_BLOCK_REQUIRED'), true);
  assert.equal(codes.includes('GLOBAL_CONTENT_MAX_EXCEEDED'), false);

  const globalErrors = validateScientificSubmissionForSubmit(
    rules,
    {
      areaId: 'area-1',
      authorCount: 2,
      keywords: ['um', 'dois', 'três'],
      structuredContent: {
        objective: 'Avaliar resultados clínicos relevantes',
        methods: 'Método prospectivo multicêntrico controlado',
        results: 'Melhora significativa foi observada',
      },
    },
    new Date('2026-08-10T12:00:00.000Z'),
  );

  assert.equal(globalErrors.some((item) => item.code === 'GLOBAL_CONTENT_MAX_EXCEEDED'), true);
});

test('antes e depois da janela o backend produz bloqueios explícitos', () => {
  const draft = {
    areaId: 'area-1',
    authorCount: 2,
    keywords: ['um', 'dois', 'três'],
    singleBlockText: 'Objetivo método resultados e conclusão',
  };

  assert.equal(
    validateScientificSubmissionForSubmit(baseRules, draft, new Date('2026-07-31T23:00:00.000Z'))
      .some((item) => item.code === 'SUBMISSION_NOT_OPEN'),
    true,
  );
  assert.equal(
    validateScientificSubmissionForSubmit(baseRules, draft, new Date('2026-09-01T02:59:00.000Z'))
      .some((item) => item.code === 'SUBMISSION_CLOSED'),
    true,
  );
});
