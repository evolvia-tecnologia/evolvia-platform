import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseWebCatalog } from './validate-event-taxonomy-contract.mjs';
import {
  CHECK_IDS,
  DEFAULT_SOURCES,
  EXPECTED_TYPE_COUNT,
  OBRIGATORIA_RE,
  TIMEOUT_MESSAGE,
  VIEWPORTS,
  buildCapabilityPage,
  buildTypeMatrix,
  evaluateRequiredCapabilitiesSnapshot,
  expectedRequiredCodes,
  extractCapabilityStyles,
  inspectCapabilityPage,
  loadRequiredCapabilitySources,
  parseCapabilityCatalog,
  parseWizardRequiredPolicy,
  runCli,
  sanitizeCapabilityManifest,
} from './validate-required-capabilities-runtime.mjs';
import { openChromiumCdp, stopChrome } from './validate-public-accessibility-runtime.mjs';

const VALIDATOR_URL = new URL('./validate-required-capabilities-runtime.mjs', import.meta.url);
const VALIDATOR_TEST_URL = new URL('./validate-required-capabilities-runtime.test.mjs', import.meta.url);

function passingCard(code, overrides = {}) {
  const required = overrides.required ?? true;
  return {
    code,
    tag: required ? 'ARTICLE' : 'BUTTON',
    required,
    disabled: required,
    pressed: required ? null : 'true',
    selected: true,
    ariaLabel: required ? `${code}, obrigatório, não pode ser desativado` : '',
    badge: required ? 'Obrigatório' : 'Recomendado',
    toggle: required ? 'Obrigatório' : 'Ativado',
    label: code === 'registration' ? 'Inscrições e participantes' : code === 'access_control' ? 'Controle de acesso' : code,
    visible: true,
    ...overrides,
  };
}

function passingSnapshot(overrides = {}) {
  const familia = overrides.familia ?? 'scientific';
  const required = familia === 'entertainment'
    ? ['registration', 'access_control']
    : ['registration'];
  const uncheck = Object.fromEntries(required.map((code) => [code, {
    found: true,
    selectedBefore: true,
    selectedAfter: true,
    stillObrigatorio: true,
    tag: 'ARTICLE',
  }]));

  return {
    tipo: overrides.tipo ?? 'tipo-canônico',
    familia,
    viewport: '1366x768',
    clientWidth: 1366,
    scrollWidth: 1366,
    bodyClientWidth: 1366,
    bodyScrollWidth: 1366,
    cards: [
      passingCard('registration', {
        ariaLabel: 'Inscrições e participantes, obrigatório, não pode ser desativado',
      }),
      passingCard('access_control', familia === 'entertainment'
        ? { ariaLabel: 'Controle de acesso, obrigatório, não pode ser desativado' }
        : {
          required: false,
          disabled: false,
          tag: 'BUTTON',
          pressed: 'false',
          selected: false,
          badge: '',
          toggle: 'Ativar',
          ariaLabel: '',
        }),
      passingCard('communication', {
        required: false,
        disabled: false,
        tag: 'BUTTON',
        badge: 'Recomendado',
        toggle: 'Ativado',
        label: 'Comunicação com participantes',
        ariaLabel: '',
      }),
    ],
    focused: [
      { code: 'communication', tag: 'BUTTON', required: false, hasVisibleFocus: true },
    ],
    uncheck,
    ...overrides,
  };
}

async function loadParsed() {
  return loadRequiredCapabilitySources();
}

test('matriz canônica tem 20 tipos e acesso só em Show/Festival', async () => {
  const { matrix, policy, webEntries } = await loadParsed();
  assert.equal(matrix.length, EXPECTED_TYPE_COUNT);
  assert.equal(webEntries.length, EXPECTED_TYPE_COUNT);
  assert.equal(new Set(matrix.map((item) => item.tipo)).size, EXPECTED_TYPE_COUNT);
  assert.deepEqual(VIEWPORTS.map((item) => item.width), [1366, 768, 390, 320]);

  const entertainment = matrix.filter((item) => item.familia === policy.entertainmentFamilyId);
  assert.equal(entertainment.length, 2);
  assert.deepEqual(
    entertainment.map((item) => item.obrigatorias),
    [
      ['registration', 'access_control'],
      ['registration', 'access_control'],
    ],
  );

  for (const item of matrix) {
    assert.ok(item.obrigatorias.includes('registration'), item.tipo);
    if (item.familia === policy.entertainmentFamilyId) {
      assert.ok(item.obrigatorias.includes('access_control'), item.tipo);
    } else {
      assert.equal(item.obrigatorias.includes('access_control'), false, item.tipo);
    }
  }
});

test('snapshot válido aprova a matriz mecânica em científico e entretenimento', async () => {
  const { policy, catalog } = await loadParsed();
  const scientific = evaluateRequiredCapabilitiesSnapshot(passingSnapshot(), policy, catalog);
  assert.equal(scientific.falhas.length, 0);
  assert.equal(scientific.checks.inscricoes_obrigatoria.ok, true);
  assert.equal(scientific.checks.acesso_politica.ok, true);
  assert.equal(scientific.checks.texto_obrigatoria.ok, true);

  const show = evaluateRequiredCapabilitiesSnapshot(passingSnapshot({
    familia: 'entertainment',
    tipo: 'entretenimento',
  }), policy, catalog);
  assert.equal(show.falhas.length, 0);
  assert.deepEqual(show.obrigatorias, ['registration', 'access_control']);
});

test('ausência de Inscrições obrigatória falha em português', async () => {
  const { policy, catalog } = await loadParsed();
  const result = evaluateRequiredCapabilitiesSnapshot(passingSnapshot({
    cards: [
      passingCard('communication', {
        required: false,
        disabled: false,
        tag: 'BUTTON',
        badge: 'Recomendado',
        toggle: 'Ativado',
        label: 'Comunicação com participantes',
        ariaLabel: '',
      }),
    ],
    uncheck: {},
  }), policy, catalog);
  assert.equal(result.checks.inscricoes_obrigatoria.ok, false);
  assert.match(result.falhas.join('\n'), /Inscrições não está obrigatória/u);
  assert.match(result.falhas.join('\n'), /falhou em inscricoes_obrigatoria/u);
});

test('Controle de acesso estrutural fora de entretenimento falha', async () => {
  const { policy, catalog } = await loadParsed();
  const result = evaluateRequiredCapabilitiesSnapshot(passingSnapshot({
    familia: 'scientific',
    cards: [
      passingCard('registration', {
        ariaLabel: 'Inscrições e participantes, obrigatório, não pode ser desativado',
      }),
      passingCard('access_control', {
        ariaLabel: 'Controle de acesso, obrigatório, não pode ser desativado',
      }),
      passingCard('communication', {
        required: false,
        disabled: false,
        tag: 'BUTTON',
        badge: 'Recomendado',
        toggle: 'Ativado',
        label: 'Comunicação com participantes',
        ariaLabel: '',
      }),
    ],
  }), policy, catalog);
  assert.equal(result.checks.acesso_politica.ok, false);
  assert.match(result.falhas.join('\n'), /não pode ser estrutural fora de Show\/Festival/u);
});

test('Show/Festival sem Controle de acesso obrigatório falha', async () => {
  const { policy, catalog } = await loadParsed();
  const result = evaluateRequiredCapabilitiesSnapshot(passingSnapshot({
    familia: 'entertainment',
    cards: [
      passingCard('registration', {
        ariaLabel: 'Inscrições e participantes, obrigatório, não pode ser desativado',
      }),
      passingCard('access_control', {
        required: false,
        disabled: false,
        tag: 'BUTTON',
        badge: '',
        toggle: 'Ativar',
        ariaLabel: '',
      }),
      passingCard('communication', {
        required: false,
        disabled: false,
        tag: 'BUTTON',
        badge: 'Recomendado',
        toggle: 'Ativado',
        label: 'Comunicação com participantes',
        ariaLabel: '',
      }),
    ],
    uncheck: {
      registration: {
        found: true,
        selectedBefore: true,
        selectedAfter: true,
        stillObrigatorio: true,
        tag: 'ARTICLE',
      },
    },
  }), policy, catalog);
  assert.equal(result.checks.acesso_politica.ok, false);
  assert.match(result.falhas.join('\n'), /deveria ser obrigatório em Show\/Festival/u);
});

test('texto Obrigatória ausente falha', async () => {
  const { policy, catalog } = await loadParsed();
  const result = evaluateRequiredCapabilitiesSnapshot(passingSnapshot({
    cards: [
      passingCard('registration', {
        badge: 'Recomendado',
        toggle: 'Ativado',
        ariaLabel: 'Inscrições e participantes',
      }),
      passingCard('communication', {
        required: false,
        disabled: false,
        tag: 'BUTTON',
        badge: 'Recomendado',
        toggle: 'Ativado',
        label: 'Comunicação com participantes',
        ariaLabel: '',
      }),
    ],
  }), policy, catalog);
  assert.equal(result.checks.texto_obrigatoria.ok, false);
  assert.match(result.falhas.join('\n'), /Texto Obrigatória\/Obrigatório ausente/u);
  assert.equal(OBRIGATORIA_RE.test('Obrigatória'), true);
  assert.equal(OBRIGATORIA_RE.test('Obrigatório'), true);
});

test('desmarcar capability obrigatória falha', async () => {
  const { policy, catalog } = await loadParsed();
  const result = evaluateRequiredCapabilitiesSnapshot(passingSnapshot({
    uncheck: {
      registration: {
        found: true,
        selectedBefore: true,
        selectedAfter: false,
        stillObrigatorio: false,
        tag: 'BUTTON',
      },
    },
    cards: [
      passingCard('registration', {
        tag: 'BUTTON',
        ariaLabel: 'Inscrições e participantes, obrigatório, não pode ser desativado',
      }),
      passingCard('communication', {
        required: false,
        disabled: false,
        tag: 'BUTTON',
        badge: 'Recomendado',
        toggle: 'Ativado',
        label: 'Comunicação com participantes',
        ariaLabel: '',
      }),
    ],
  }), policy, catalog);
  assert.equal(result.checks.nao_desmarca.ok, false);
  assert.match(result.falhas.join('\n'), /pôde ser desmarcada/u);
});

test('foco de teclado ausente falha', async () => {
  const { policy, catalog } = await loadParsed();
  const result = evaluateRequiredCapabilitiesSnapshot(passingSnapshot({
    focused: [],
  }), policy, catalog);
  assert.equal(result.checks.teclado_foco.ok, false);
  assert.match(result.falhas.join('\n'), /Foco de teclado ausente/u);
});

test('overflow horizontal em 320 falha', async () => {
  const { policy, catalog } = await loadParsed();
  const result = evaluateRequiredCapabilitiesSnapshot(passingSnapshot({
    viewport: '320x720',
    clientWidth: 320,
    scrollWidth: 480,
    bodyClientWidth: 320,
    bodyScrollWidth: 480,
  }), policy, catalog);
  assert.equal(result.checks.overflow_horizontal.ok, false);
  assert.match(result.falhas.join('\n'), /overflow horizontal em 320x720/u);
});

test('manifesto é JSON minimizado, sem PII e sem detalhes textuais', async () => {
  const manifest = {
    sourceSha: 'abc123',
    ok: true,
    tipos: [{
      familia: 'entertainment',
      tipo: 'Festival',
      obrigatorias: ['registration', 'access_control'],
      viewports: [{
        viewport: '1366x768',
        verificacoes: Object.fromEntries(CHECK_IDS.map((id) => [id, {
          ok: true,
          detalhe: 'owner-1@evolvia-ci.local',
        }])),
        innerText: 'Berg Martins',
      }],
    }],
    email: 'owner-1@evolvia-ci.local',
  };

  const json = sanitizeCapabilityManifest(manifest);
  assert.equal(json.includes('\n'), false);
  assert.doesNotMatch(json, /@|owner-|Berg|password|Bearer/u);
  assert.doesNotMatch(json, /detalhe|innerText|email/u);
  const parsed = JSON.parse(json);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.viewports, ['1366x768', '768x1024', '390x844', '320x720']);
  assert.equal(parsed.tipos[0].verificacoes, undefined);
  assert.equal(parsed.tipos[0].viewports[0].verificacoes.inscricoes_obrigatoria.ok, true);
  assert.equal(parsed.tipos[0].viewports[0].verificacoes.inscricoes_obrigatoria.detalhe, undefined);
});

test('o validador reutiliza o Chromium existente e não abre segundo servidor', async () => {
  const [validatorSource, testSource] = await Promise.all([
    readFile(VALIDATOR_URL, 'utf8'),
    readFile(VALIDATOR_TEST_URL, 'utf8'),
  ]);

  assert.match(validatorSource, /from '\.\/validate-public-accessibility-runtime\.mjs'/u);
  assert.match(validatorSource, /from '\.\/validate-event-taxonomy-contract\.mjs'/u);
  assert.match(validatorSource, /openChromiumCdp/u);
  assert.match(validatorSource, /Page\.setDocumentContent/u);
  assert.match(validatorSource, /mobile: false/u);
  assert.match(validatorSource, /JSON\.stringify\(cleaned\)/u);
  assert.doesNotMatch(validatorSource, /puppeteer|playwright|chromium\.launch|createServer|listen\(/u);
  assert.doesNotMatch(validatorSource, /EVOLVIA_WEB_URL/u);
  assert.match(testSource, /prova Chromium negativa/u);

  const catalog = parseWebCatalog(await readFile(DEFAULT_SOURCES.webCatalog, 'utf8'));
  for (const value of catalog.map((item) => item.value)) {
    assert.equal(
      validatorSource.includes(`'${value}'`),
      false,
      `o validador não pode hardcodar ${value}`,
    );
  }
});

test('fontes canônicas rejeitam Wizard sem bloqueio visual', async () => {
  const wizard = await readFile(DEFAULT_SOURCES.wizard, 'utf8');
  assert.throws(
    () => parseWizardRequiredPolicy(wizard.replace('aria-required="true" aria-disabled="true"', '')),
    /article não acionável/u,
  );
  assert.throws(
    () => parseWizardRequiredPolicy(wizard.replace("allProfiles: ['registration']", "allProfiles: ['payment']")),
    /Inscrições \(registration\)/u,
  );
  assert.throws(
    () => parseCapabilityCatalog('export const CAPABILITY_CATALOG = [\n] as const;'),
    /nenhum item foi extraído/u,
  );
});

test('página gerada espelha article obrigatório e botão opcional', async () => {
  const { policy, catalog, styles, matrix } = await loadParsed();
  const show = matrix.find((item) => item.familia === policy.entertainmentFamilyId);
  const other = matrix.find((item) => item.familia !== policy.entertainmentFamilyId);
  const showHtml = buildCapabilityPage({
    eventType: show.tipo,
    familyId: show.familia,
    catalog,
    policy,
    styles,
  });
  const otherHtml = buildCapabilityPage({
    eventType: other.tipo,
    familyId: other.familia,
    catalog,
    policy,
    styles,
  });

  assert.match(showHtml, /data-code="registration"[\s\S]*aria-required="true"/u);
  assert.match(showHtml, /data-code="access_control"[\s\S]*aria-required="true"/u);
  assert.match(showHtml, />Obrigatório</u);
  assert.doesNotMatch(otherHtml, /data-code="access_control"[\s\S]*aria-required="true"/u);
  assert.match(otherHtml, /<button type="button" class="capability-card[\s\S]*data-code="access_control"/u);
  assert.match(styles, /\.capability-card:focus-visible/u);
  assert.deepEqual(expectedRequiredCodes(show.familia, policy), ['registration', 'access_control']);
  assert.deepEqual(expectedRequiredCodes(other.familia, policy), ['registration']);
});

test('prova Chromium: 20 tipos, teclado, foco, texto e bloqueio de desmarcar', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'evolvia-cap-runtime-'));
  const output = join(outputDir, 'required-capabilities-runtime.json');
  const previous = process.env.EVOLVIA_CAPABILITIES_OUTPUT;
  process.env.EVOLVIA_CAPABILITIES_OUTPUT = output;

  try {
    const code = await runCli({ output, timeoutMs: 150_000 });
    assert.equal(code, 0);
    const json = await readFile(output, 'utf8');
    assert.equal(json.includes('\n'), false);
    assert.doesNotMatch(json, /@|password|Bearer|cpf/u);
    const parsed = JSON.parse(json);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.tipos.length, EXPECTED_TYPE_COUNT);
    assert.deepEqual(parsed.viewports, ['1366x768', '768x1024', '390x844', '320x720']);
    assert.equal(parsed.navegador, 'chromium-cdp');

    for (const item of parsed.tipos) {
      assert.equal(item.viewports.length, 4);
      for (const viewport of item.viewports) {
        for (const id of CHECK_IDS) {
          assert.equal(viewport.verificacoes[id].ok, true, `${item.familia}/${viewport.viewport}/${id}`);
        }
      }
    }

    const entertainment = parsed.tipos.filter((item) => item.familia === 'entertainment');
    assert.equal(entertainment.length, 2);
    for (const item of entertainment) {
      assert.deepEqual(item.obrigatorias, ['registration', 'access_control']);
    }
  } finally {
    if (previous === undefined) delete process.env.EVOLVIA_CAPABILITIES_OUTPUT;
    else process.env.EVOLVIA_CAPABILITIES_OUTPUT = previous;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('prova Chromium negativa: article virar botão permite desmarcar e falha', async () => {
  const { policy, catalog, styles, matrix } = await loadParsed();
  const sample = matrix.find((item) => item.familia !== policy.entertainmentFamilyId);
  const html = buildCapabilityPage({
    eventType: sample.tipo,
    familyId: sample.familia,
    catalog,
    policy,
    styles,
  }).replace(
    /<article class="capability-card selected" data-code="registration"[\s\S]*?<\/article>/u,
    '<button type="button" class="capability-card selected" data-code="registration" aria-pressed="true"><span class="recommended-badge">Recomendado</span><strong>Inscrições e participantes</strong><span class="capability-toggle on">Ativado</span></button>',
  );

  let session;
  try {
    session = await openChromiumCdp();
    await session.cdp.send('Runtime.enable');
    await session.cdp.send('Page.enable');
    const snapshot = await inspectCapabilityPage(session.cdp, html, VIEWPORTS[0], ['registration']);
    const evaluation = evaluateRequiredCapabilitiesSnapshot({
      ...snapshot,
      tipo: sample.tipo,
      familia: sample.familia,
    }, policy, catalog);
    assert.equal(evaluation.checks.nao_desmarca.ok, false);
    assert.equal(evaluation.checks.texto_obrigatoria.ok, false);
    assert.match(evaluation.falhas.join('\n'), /nao_desmarca|texto_obrigatoria/u);
  } finally {
    await stopChrome(session);
  }
});

test('extractCapabilityStyles e buildTypeMatrix rejeitam entradas inválidas', async () => {
  const globals = await readFile(DEFAULT_SOURCES.globals, 'utf8');
  const tokens = await readFile(DEFAULT_SOURCES.tokens, 'utf8');
  const styles = extractCapabilityStyles(tokens, globals);
  assert.match(styles, /min-height:210px/u);
  assert.match(styles, /grid-template-columns:1fr/u);

  assert.throws(
    () => extractCapabilityStyles(tokens, globals.replace('.capability-card:focus-visible', '.other-card:focus-visible')),
    /foco visível/u,
  );
  const policy = parseWizardRequiredPolicy(await readFile(DEFAULT_SOURCES.wizard, 'utf8'));
  assert.throws(
    () => buildTypeMatrix([], policy),
    new RegExp(`${EXPECTED_TYPE_COUNT} tipos canônicos`, 'u'),
  );
  assert.equal(TIMEOUT_MESSAGE.includes('capabilities obrigatórias'), true);
  assert.equal(typeof fileURLToPath(VALIDATOR_URL), 'string');
  await assert.rejects(() => access(join(tmpdir(), 'missing-evolvia-cap-runtime')), /ENOENT/u);
});
