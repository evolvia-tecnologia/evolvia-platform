import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWebCatalog } from './validate-event-taxonomy-contract.mjs';
import {
  openChromiumCdp,
  runWithWatchdog,
  stopChrome,
} from './validate-public-accessibility-runtime.mjs';

export const TIMEOUT_MESSAGE = 'A prova visual das capabilities obrigatórias excedeu o tempo máximo de execução.';
export const EXPECTED_TYPE_COUNT = 19;
export const MANIFEST_LIMIT_BYTES = 64 * 1024;
export const OBRIGATORIA_RE = /Obrigat[oó]ri[oa]/iu;

const SCRIPT_TIMEOUT_MS = 180_000;
const MAX_TABS = 24;
const SETTLE_MS = 120;

export const VIEWPORTS = Object.freeze([
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
]);

export const CHECK_IDS = Object.freeze([
  'inscricoes_obrigatoria',
  'acesso_politica',
  'texto_obrigatoria',
  'nao_desmarca',
  'teclado_foco',
  'overflow_horizontal',
]);

export const DEFAULT_SOURCES = Object.freeze({
  webCatalog: new URL('../apps/web/lib/event-profile-catalog.ts', import.meta.url),
  wizard: new URL('../apps/web/components/event-wizard.tsx', import.meta.url),
  globals: new URL('../apps/web/app/globals.css', import.meta.url),
  tokens: new URL('../apps/web/app/design-tokens.css', import.meta.url),
  apiPolicy: new URL('../apps/api/src/wizard-policy.ts', import.meta.url),
});

const PII_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|Bearer\s+[A-Za-z0-9._~+/-]+=*|password|cpf\b|cnpj\b/iu;

function isMainModule() {
  const invoked = process.argv[1];
  return Boolean(invoked) && fileURLToPath(import.meta.url) === resolve(invoked);
}

function shouldRunCli() {
  if (!isMainModule()) return false;
  if (process.env.NODE_TEST_CONTEXT) return false;
  if (process.argv.includes('--test')) return false;
  return !process.execArgv.some((arg) => arg === '--test' || arg.startsWith('--test='));
}

function fail(message) {
  throw new Error(message);
}

function check(ok, detalhe) {
  return { ok: Boolean(ok), detalhe };
}

function quoted(value) {
  return `«${String(value)}»`;
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function codesFromList(raw) {
  return [...String(raw).matchAll(/'([^']+)'/gu)].map((item) => item[1]);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function parseWizardRequiredPolicy(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    fail('Fonte canônica ausente: o Wizard está vazio.');
  }

  const familyMatch = source.match(/const ENTERTAINMENT_PROFILE_GROUP_ID = '([^']+)';/u);
  const policyMatch = source.match(/const WIZARD_REQUIRED_CAPABILITIES = \{([\s\S]*?)\} as const;/u);
  const allMatch = policyMatch?.[1].match(/allProfiles:\s*\[([^\]]*)\]/u);
  const extraMatch = policyMatch?.[1].match(/entertainment:\s*\[([^\]]*)\]/u);

  if (!familyMatch || !policyMatch || !allMatch || !extraMatch) {
    fail('Fonte canônica malformada: a política de capabilities obrigatórias do Wizard não foi encontrada.');
  }

  const allProfiles = codesFromList(allMatch[1]);
  const entertainment = codesFromList(extraMatch[1]);
  if (!allProfiles.includes('registration')) {
    fail('A política do Wizard precisa declarar Inscrições (registration) como obrigatória em todos os perfis.');
  }
  if (!entertainment.includes('access_control')) {
    fail('A política do Wizard precisa declarar Controle de acesso (access_control) em entretenimento.');
  }

  if (!source.includes('if (isRequiredWizardCapability(item.code, draft.eventType)) return;')) {
    fail('O Wizard precisa recusar a desmarcação de capability obrigatória.');
  }
  if (!source.includes('<article key={item.code} className="capability-card selected" aria-required="true" aria-disabled="true"')) {
    fail('O cartão obrigatório do Wizard precisa ser um article não acionável.');
  }
  if (!OBRIGATORIA_RE.test(source)) {
    fail('O Wizard precisa exibir o texto Obrigatória/Obrigatório no cartão estrutural.');
  }

  return Object.freeze({
    allProfiles,
    entertainment,
    entertainmentFamilyId: familyMatch[1],
  });
}

export function parseCapabilityCatalog(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    fail('Fonte canônica ausente: o catálogo de capabilities da API está vazio.');
  }

  const marker = 'export const CAPABILITY_CATALOG';
  const start = source.indexOf(marker);
  if (start === -1) {
    fail('Fonte canônica ausente: CAPABILITY_CATALOG não foi encontrado.');
  }

  const bodyStart = source.indexOf('[', start);
  const end = source.indexOf('\n] as const', bodyStart);
  if (bodyStart === -1 || end === -1) {
    fail('Fonte canônica malformada: CAPABILITY_CATALOG não termina com ] as const.');
  }

  const body = source.slice(bodyStart, end);
  const pattern = /\{\s*code:\s*'([^']+)',\s*label:\s*'([^']+)',\s*shortLabel:\s*'([^']+)',\s*description:\s*'([^']+)',\s*value:\s*'([^']+)',\s*category:\s*'([^']+)'/gu;
  const entries = [];
  let match = pattern.exec(body);
  while (match) {
    entries.push({
      code: match[1],
      label: match[2],
      shortLabel: match[3],
      description: match[4],
      value: match[5],
      category: match[6],
    });
    match = pattern.exec(body);
  }

  if (entries.length === 0) {
    fail('Fonte canônica malformada: nenhum item foi extraído de CAPABILITY_CATALOG.');
  }

  const registration = entries.find((item) => item.code === 'registration');
  const access = entries.find((item) => item.code === 'access_control');
  if (!registration || !/Inscri/u.test(registration.shortLabel) || !/Inscri/u.test(registration.label)) {
    fail('O catálogo precisa expor a capability Inscrições com o código registration.');
  }
  if (!access || !/Controle de acesso/u.test(access.label)) {
    fail('O catálogo precisa expor a capability Controle de acesso com o código access_control.');
  }

  return entries;
}

export function extractCapabilityStyles(tokensCss, globalsCss) {
  const root = tokensCss.match(/:root\s*\{[\s\S]*?\n\}/u)?.[0];
  const aliases = globalsCss.match(/:root\{[\s\S]*?\}/u)?.[0];
  const focus = globalsCss.match(/\.btn:focus-visible,[^{]+\{[^}]+\}/u)?.[0];
  if (!root || !aliases || !focus || !focus.includes('.capability-card:focus-visible')) {
    fail('O CSS canônico precisa declarar foco visível em .capability-card.');
  }
  if (!/body\{min-width:320px\}/u.test(globalsCss)) {
    fail('O CSS canônico precisa preservar body{min-width:320px}.');
  }
  if (!/@media\(max-width:700px\)\{[\s\S]*\.capability-grid[\s\S]*grid-template-columns:1fr/u.test(globalsCss)) {
    fail('O CSS canônico precisa recolocar .capability-grid em 1 coluna abaixo de 700px.');
  }

  const localRules = [...globalsCss.matchAll(
    /^\.(?:capability-grid|capability-card|capability-card:hover|capability-card\.selected|capability-head|capability-category|capability-toggle|capability-toggle\.on|recommended-badge)[^{]*\{[^}]+\}/gmu,
  )].map((item) => item[0]);

  if (localRules.length < 6) {
    fail('O CSS canônico das capability-cards está incompleto.');
  }

  return [
    root,
    aliases,
    'html,body{margin:0}',
    'body{min-width:320px}',
    focus,
    ...localRules,
    '@media(max-width:700px){.capability-grid{grid-template-columns:1fr}}',
  ].join('\n');
}

export function expectedRequiredCodes(familyId, policy) {
  const required = [...policy.allProfiles];
  if (familyId === policy.entertainmentFamilyId) {
    required.push(...policy.entertainment);
  }
  return required;
}

export function buildTypeMatrix(webEntries, policy) {
  if (!Array.isArray(webEntries) || webEntries.length !== EXPECTED_TYPE_COUNT) {
    fail(`A matriz visual precisa dos ${EXPECTED_TYPE_COUNT} tipos canônicos.`);
  }

  const seen = new Set();
  return webEntries.map((item) => {
    if (!item?.value || !item?.familyId) {
      fail('A matriz visual encontrou tipo sem valor ou família.');
    }
    if (seen.has(item.value)) {
      fail(`Duplicidade na matriz visual: ${quoted(item.value)}.`);
    }
    seen.add(item.value);
    return {
      tipo: item.value,
      familia: item.familyId,
      obrigatorias: expectedRequiredCodes(item.familyId, policy),
    };
  });
}

export function buildCapabilityPage({ eventType, familyId, catalog, policy, styles }) {
  const required = new Set(expectedRequiredCodes(familyId, policy));
  const cards = catalog.map((item) => {
    const isRequired = required.has(item.code);
    const selected = isRequired || item.code === 'communication';
    const badge = isRequired
      ? '<span class="recommended-badge">Obrigatório</span>'
      : item.code === 'communication'
        ? '<span class="recommended-badge">Recomendado</span>'
        : '';
    const body = [
      `<div class="capability-head"><span class="capability-category">${escapeHtml(item.category)}</span>${badge}</div>`,
      `<strong>${escapeHtml(item.label)}</strong>`,
      `<p>${escapeHtml(item.description)}</p>`,
      `<small>${isRequired ? 'Este recurso faz parte da estrutura do evento e não pode ser removido.' : escapeHtml(item.value)}</small>`,
      `<span class="capability-toggle ${selected ? 'on' : ''}">${isRequired ? 'Obrigatório' : selected ? 'Ativado' : 'Ativar'}</span>`,
    ].join('');

    if (isRequired) {
      return `<article class="capability-card selected" data-code="${escapeHtml(item.code)}" aria-required="true" aria-disabled="true" aria-label="${escapeHtml(item.label)}, obrigatório, não pode ser desativado">${body}</article>`;
    }

    return `<button type="button" class="capability-card ${selected ? 'selected' : ''}" data-code="${escapeHtml(item.code)}" aria-pressed="${selected}">${body}</button>`;
  }).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Recursos</title>
<style>${styles}</style>
</head>
<body>
<main>
  <h1>Sua estrutura inicial está pronta</h1>
  <p>Recursos estruturais obrigatórios não podem ser removidos.</p>
  <div class="capability-grid" data-event-type="${escapeHtml(eventType)}" data-family="${escapeHtml(familyId)}">${cards}</div>
</main>
<script>
document.querySelectorAll('button.capability-card').forEach((button) => {
  button.addEventListener('click', () => {
    const on = button.classList.toggle('selected');
    button.setAttribute('aria-pressed', String(on));
    const toggle = button.querySelector('.capability-toggle');
    if (toggle) {
      toggle.classList.toggle('on', on);
      toggle.textContent = on ? 'Ativado' : 'Ativar';
    }
  });
});
</script>
</body>
</html>`;
}

const COLLECT_CARDS_JS = `(() => {
  const root = document.documentElement;
  const cards = [...document.querySelectorAll('.capability-card')].map((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      code: el.getAttribute('data-code') || '',
      tag: el.tagName,
      required: el.getAttribute('aria-required') === 'true',
      disabled: el.getAttribute('aria-disabled') === 'true',
      pressed: el.getAttribute('aria-pressed'),
      selected: el.classList.contains('selected'),
      ariaLabel: el.getAttribute('aria-label') || '',
      badge: (el.querySelector('.recommended-badge')?.textContent || '').trim(),
      toggle: (el.querySelector('.capability-toggle')?.textContent || '').trim(),
      label: (el.querySelector('strong')?.textContent || '').trim(),
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
    };
  });
  return {
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    bodyClientWidth: document.body?.clientWidth ?? 0,
    bodyScrollWidth: document.body?.scrollWidth ?? 0,
    cards,
  };
})()`;

const FOCUS_INFO_JS = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return { code: '', tag: '', hasVisibleFocus: false, required: false };
  }
  const style = getComputedStyle(el);
  const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
  const outlineVisible = style.outlineStyle !== 'none' && outlineWidth >= 2;
  const shadowVisible = Boolean(style.boxShadow && style.boxShadow !== 'none');
  return {
    code: el.getAttribute('data-code') || '',
    tag: el.tagName,
    required: el.getAttribute('aria-required') === 'true',
    hasVisibleFocus: outlineVisible || shadowVisible,
  };
})()`;

export function evaluateRequiredCapabilitiesSnapshot(snapshot, policy, catalog) {
  const tipo = snapshot.tipo ?? 'tipo';
  const viewport = snapshot.viewport ?? 'viewport';
  const contexto = `${tipo} em ${viewport}`;
  const requiredCodes = expectedRequiredCodes(snapshot.familia, policy);
  const cards = Array.isArray(snapshot.cards) ? snapshot.cards : [];
  const byCode = new Map(cards.map((item) => [item.code, item]));
  const registration = catalog.find((item) => item.code === 'registration');
  const access = catalog.find((item) => item.code === 'access_control');
  const checks = {};

  const registrationCard = byCode.get('registration');
  const registrationOk = Boolean(
    registrationCard
    && requiredCodes.includes('registration')
    && registrationCard.required
    && registrationCard.disabled
    && registrationCard.selected
    && registrationCard.tag === 'ARTICLE'
    && registrationCard.visible
    && (
      registrationCard.label === registration?.label
      || registrationCard.label === registration?.shortLabel
    ),
  );
  checks.inscricoes_obrigatoria = check(
    registrationOk,
    registrationOk
      ? 'Inscrições permanece obrigatória e visível'
      : 'Inscrições não está obrigatória, visível e bloqueada neste tipo',
  );

  const accessRequired = requiredCodes.includes('access_control');
  const accessCard = byCode.get('access_control');
  let accessOk = false;
  let accessDetalhe = 'Controle de acesso ausente no snapshot';
  if (accessRequired) {
    accessOk = Boolean(
      accessCard
      && accessCard.required
      && accessCard.disabled
      && accessCard.selected
      && accessCard.tag === 'ARTICLE'
      && accessCard.visible
      && accessCard.label === access?.label,
    );
    accessDetalhe = accessOk
      ? 'Controle de acesso é obrigatório em entretenimento'
      : 'Controle de acesso deveria ser obrigatório em Show/Festival';
  } else {
    accessOk = !accessCard?.required && accessCard?.tag !== 'ARTICLE';
    accessDetalhe = accessOk
      ? 'Controle de acesso permanece opcional fora de entretenimento'
      : 'Controle de acesso não pode ser estrutural fora de Show/Festival';
  }
  checks.acesso_politica = check(accessOk, accessDetalhe);

  const requiredCards = cards.filter((item) => requiredCodes.includes(item.code));
  const textoOk = requiredCards.length === requiredCodes.length
    && requiredCards.every((item) => (
      OBRIGATORIA_RE.test(item.badge)
      && OBRIGATORIA_RE.test(item.toggle)
      && OBRIGATORIA_RE.test(item.ariaLabel)
    ));
  checks.texto_obrigatoria = check(
    textoOk,
    textoOk
      ? 'Texto Obrigatória/Obrigatório visível nos cartões estruturais'
      : 'Texto Obrigatória/Obrigatório ausente em capability obrigatória',
  );

  const uncheck = snapshot.uncheck ?? {};
  const lockedOk = requiredCards.every((item) => {
    const attempt = uncheck[item.code];
    return item.tag === 'ARTICLE'
      && item.required
      && item.selected
      && attempt?.found
      && attempt.selectedBefore
      && attempt.selectedAfter
      && attempt.stillObrigatorio
      && attempt.tag === 'ARTICLE';
  });
  checks.nao_desmarca = check(
    lockedOk,
    lockedOk
      ? 'Clique e teclado não desmarcam capabilities obrigatórias'
      : 'Capability obrigatória pôde ser desmarcada ou não é um article bloqueado',
  );

  const focused = Array.isArray(snapshot.focused) ? snapshot.focused : [];
  const optionalCodes = cards.filter((item) => !requiredCodes.includes(item.code) && item.tag === 'BUTTON').map((item) => item.code);
  const focusedOptional = focused.filter((item) => item.code && optionalCodes.includes(item.code));
  const visibleOptional = focusedOptional.filter((item) => item.hasVisibleFocus);
  const requiredFocusedAsButton = focused.some((item) => requiredCodes.includes(item.code) && item.tag === 'BUTTON');
  const focusOk = optionalCodes.length > 0
    && visibleOptional.length > 0
    && !requiredFocusedAsButton;
  checks.teclado_foco = check(
    focusOk,
    focusOk
      ? 'Foco de teclado visível nos cartões opcionais; obrigatórios não são botões'
      : 'Foco de teclado ausente ou capability obrigatória entrou como botão',
  );

  const overflow = Number(snapshot.scrollWidth) <= Number(snapshot.clientWidth)
    && Number(snapshot.bodyScrollWidth) <= Number(snapshot.bodyClientWidth);
  checks.overflow_horizontal = check(
    overflow,
    overflow
      ? `scrollWidth ${snapshot.scrollWidth} <= clientWidth ${snapshot.clientWidth}`
      : `overflow horizontal em ${viewport}`,
  );

  const falhas = CHECK_IDS
    .filter((id) => !checks[id]?.ok)
    .map((id) => `O tipo ${contexto} falhou em ${id}: ${checks[id].detalhe}.`);

  return { checks, falhas, obrigatorias: requiredCodes };
}

export function sanitizeCapabilityManifest(manifest) {
  const tipos = Array.isArray(manifest?.tipos) ? manifest.tipos : [];
  const cleaned = {
    sourceSha: manifest?.sourceSha ?? null,
    navegador: 'chromium-cdp',
    viewports: VIEWPORTS.map((item) => `${item.width}x${item.height}`),
    tipos: tipos.map((item) => ({
      familia: String(item?.familia ?? '').slice(0, 32),
      tipo: String(item?.tipo ?? '').slice(0, 80),
      obrigatorias: Array.isArray(item?.obrigatorias)
        ? item.obrigatorias.map((code) => String(code).slice(0, 32))
        : [],
      viewports: (Array.isArray(item?.viewports) ? item.viewports : []).map((entry) => ({
        viewport: String(entry?.viewport ?? '').slice(0, 16),
        verificacoes: Object.fromEntries(
          CHECK_IDS.map((id) => [id, { ok: Boolean(entry?.verificacoes?.[id]?.ok) }]),
        ),
      })),
    })),
    ok: Boolean(manifest?.ok),
  };

  const json = JSON.stringify(cleaned);
  if (Buffer.byteLength(json, 'utf8') > MANIFEST_LIMIT_BYTES) {
    fail(`O manifesto das capabilities excedeu ${MANIFEST_LIMIT_BYTES} bytes.`);
  }
  if (PII_RE.test(json)) {
    fail('O manifesto das capabilities não pode conter dados pessoais.');
  }
  return json;
}

export async function loadRequiredCapabilitySources(paths = DEFAULT_SOURCES) {
  const [webSource, wizardSource, globalsCss, tokensCss, apiPolicy] = await Promise.all([
    readFile(paths.webCatalog, 'utf8'),
    readFile(paths.wizard, 'utf8'),
    readFile(paths.globals, 'utf8'),
    readFile(paths.tokens, 'utf8'),
    readFile(paths.apiPolicy, 'utf8'),
  ]);

  const policy = parseWizardRequiredPolicy(wizardSource);
  const catalog = parseCapabilityCatalog(apiPolicy);
  const webEntries = parseWebCatalog(webSource);
  const styles = extractCapabilityStyles(tokensCss, globalsCss);
  const matrix = buildTypeMatrix(webEntries, policy);

  return { policy, catalog, webEntries, styles, matrix };
}

async function evaluateCdp(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    fail('A inspeção da página no Chromium lançou uma exceção.');
  }
  return result.result?.value;
}

async function pressTab(cdp) {
  const event = {
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
}

async function collectFocus(cdp) {
  await evaluateCdp(cdp, 'document.activeElement && document.activeElement.blur && document.activeElement.blur()');
  const focused = [];
  const seen = new Set();
  for (let index = 0; index < MAX_TABS; index += 1) {
    await pressTab(cdp);
    const info = await evaluateCdp(cdp, FOCUS_INFO_JS);
    if (!info?.code) continue;
    const key = `${info.code}:${info.tag}:${info.hasVisibleFocus}`;
    if (seen.has(key)) continue;
    seen.add(key);
    focused.push(info);
  }
  return focused;
}

async function attemptUncheck(cdp, requiredCodes) {
  return evaluateCdp(cdp, `(() => {
    const codes = ${JSON.stringify(requiredCodes)};
    const results = {};
    for (const code of codes) {
      const card = document.querySelector('[data-code="' + code + '"]');
      if (!card) {
        results[code] = { found: false, selectedBefore: false, selectedAfter: false, stillObrigatorio: false, tag: '' };
        continue;
      }
      const before = card.classList.contains('selected');
      card.click();
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      card.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const toggle = (card.querySelector('.capability-toggle')?.textContent || '');
      results[code] = {
        found: true,
        selectedBefore: before,
        selectedAfter: card.classList.contains('selected'),
        stillObrigatorio: ${OBRIGATORIA_RE}.test(toggle),
        tag: card.tagName,
      };
    }
    return results;
  })()`);
}

export async function inspectCapabilityPage(cdp, html, viewport, requiredCodes) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const tree = await cdp.send('Page.getFrameTree');
  const frameId = tree.frameTree?.frame?.id;
  if (!frameId) fail('O Chromium não publicou o frame principal da prova visual.');
  await cdp.send('Page.setDocumentContent', { frameId, html });
  await sleep(SETTLE_MS);

  const collected = await evaluateCdp(cdp, COLLECT_CARDS_JS);
  const focused = await collectFocus(cdp);
  const uncheck = await attemptUncheck(cdp, requiredCodes);

  return {
    ...collected,
    focused,
    uncheck,
    viewport: `${viewport.width}x${viewport.height}`,
  };
}

export async function runBrowserProof(options = {}) {
  const timeoutMs = options.timeoutMs ?? SCRIPT_TIMEOUT_MS;
  const sources = options.sources ?? await loadRequiredCapabilitySources(options.paths);
  const { policy, catalog, styles, matrix } = sources;
  const tipos = [];
  const falhas = [];
  let session;

  await runWithWatchdog(async (signal) => {
    session = await openChromiumCdp();
    await session.cdp.send('Runtime.enable');
    await session.cdp.send('Page.enable');

    for (const item of matrix) {
      if (signal.aborted) fail(TIMEOUT_MESSAGE);
      const html = buildCapabilityPage({
        eventType: item.tipo,
        familyId: item.familia,
        catalog,
        policy,
        styles,
      });
      const viewports = [];
      for (const viewport of VIEWPORTS) {
        if (signal.aborted) fail(TIMEOUT_MESSAGE);
        const snapshot = await inspectCapabilityPage(session.cdp, html, viewport, item.obrigatorias);
        const evaluation = evaluateRequiredCapabilitiesSnapshot({
          ...snapshot,
          tipo: item.tipo,
          familia: item.familia,
        }, policy, catalog);
        viewports.push({
          viewport: snapshot.viewport,
          verificacoes: evaluation.checks,
        });
        falhas.push(...evaluation.falhas);
      }
      tipos.push({
        familia: item.familia,
        tipo: item.tipo,
        obrigatorias: item.obrigatorias,
        viewports,
      });
    }
  }, {
    timeoutMs,
    timeoutMessage: TIMEOUT_MESSAGE,
    cleanup: async () => stopChrome(session),
  });

  return { tipos, falhas, ok: falhas.length === 0 };
}

export async function runCli(options = {}) {
  const output = resolve(options.output ?? process.env.EVOLVIA_CAPABILITIES_OUTPUT ?? 'visual-evidence/required-capabilities-runtime.json');
  const sourceSha = process.env.GITHUB_SHA ?? null;
  const sources = await loadRequiredCapabilitySources(options.paths);
  const proof = await runBrowserProof({ ...options, sources });
  const json = sanitizeCapabilityManifest({
    sourceSha,
    tipos: proof.tipos,
    ok: proof.ok,
  });

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, json, 'utf8');

  if (!proof.ok) {
    console.error(proof.falhas.join('\n'));
    process.exitCode = 1;
    return 1;
  }

  console.log(JSON.stringify({
    sourceSha,
    arquivo: output,
    tipos: proof.tipos.length,
    viewports: VIEWPORTS.length,
    ok: true,
  }));
  return 0;
}

if (shouldRunCli()) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha na prova visual das capabilities obrigatórias.');
    process.exitCode = 1;
  });
}
