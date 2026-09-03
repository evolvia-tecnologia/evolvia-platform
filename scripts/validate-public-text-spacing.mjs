import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  browserHarness,
  runWithWatchdog,
} from './validate-public-accessibility-runtime.mjs';

const SCRIPT_TIMEOUT_MS = 180_000;
const PAGE_TIMEOUT_MS = 15_000;
const MANIFEST_LIMIT_BYTES = 192 * 1024;
const OFFENDER_LIMIT = 8;

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
];

const STATIC_PATHS = [
  '/',
  '/login',
  '/cadastro',
  '/eventos',
  '/eventos?period=PAST',
  '/eventos?period=ALL',
  '/termos-de-uso',
  '/privacidade',
];

export const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p {
    margin-block-end: 2em !important;
  }
`;

export const CHECK_IDS = [
  'http_200',
  'override_aplicado',
  'overflow_horizontal',
  'sem_corte_textual',
  'conteudo_preservado',
  'controles_preservados',
  'main_preservado',
];

function isMainModule() {
  const invoked = process.argv[1];
  return Boolean(invoked) && fileURLToPath(import.meta.url) === resolve(invoked);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function check(ok, detalhe) {
  return { ok: Boolean(ok), detalhe };
}

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

export function sanitizeClippedText(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, OFFENDER_LIMIT).map((item) => ({
    tag: clip(item?.tag, 32),
    id: clip(item?.id, 64),
    className: clip(item?.className, 120),
    width: Number(item?.width) || 0,
    height: Number(item?.height) || 0,
    scrollWidth: Number(item?.scrollWidth) || 0,
    scrollHeight: Number(item?.scrollHeight) || 0,
    overflowX: clip(item?.overflowX, 16),
    overflowY: clip(item?.overflowY, 16),
  }));
}

export function evaluateTextSpacingSnapshot(snapshot) {
  const checks = {};

  checks.http_200 = check(
    snapshot.httpStatus === 200,
    snapshot.httpStatus === 200
      ? 'Resposta final HTTP 200'
      : `Resposta final HTTP ${snapshot.httpStatus ?? 'ausente'}`,
  );

  const probe = snapshot.probe ?? {};
  const overrideApplied = Number(probe.lineHeight) >= 24
    && Number(probe.letterSpacing) >= 1.92
    && Number(probe.wordSpacing) >= 2.56
    && Number(probe.marginBottom) >= 32;
  checks.override_aplicado = check(
    overrideApplied,
    overrideApplied
      ? 'Override SC 1.4.12 comprovado no estilo computado'
      : 'O espaçamento SC 1.4.12 não foi aplicado integralmente',
  );

  const overflow = Number(snapshot.scrollWidth) <= Number(snapshot.clientWidth)
    && Number(snapshot.bodyScrollWidth) <= Number(snapshot.bodyClientWidth);
  checks.overflow_horizontal = check(
    overflow,
    overflow
      ? `scrollWidth ${snapshot.scrollWidth} <= clientWidth ${snapshot.clientWidth}`
      : `overflow horizontal após espaçamento (scrollWidth ${snapshot.scrollWidth}; clientWidth ${snapshot.clientWidth})`,
  );

  const clipped = Array.isArray(snapshot.clippedText) ? snapshot.clippedText : [];
  checks.sem_corte_textual = check(
    clipped.length === 0,
    clipped.length === 0
      ? 'Nenhum texto visível foi cortado por overflow restritivo'
      : `${clipped.length} elemento(s) textual(is) com conteúdo cortado`,
  );

  const beforeText = Number(snapshot.baselineTextCount) || 0;
  const afterText = Number(snapshot.textCount) || 0;
  checks.conteudo_preservado = check(
    beforeText > 0 && afterText >= beforeText,
    beforeText > 0 && afterText >= beforeText
      ? `${afterText} elementos textuais preservados`
      : `conteúdo textual visível caiu de ${beforeText} para ${afterText}`,
  );

  const beforeControls = Number(snapshot.baselineControlCount) || 0;
  const afterControls = Number(snapshot.controlCount) || 0;
  const unnamedControls = Number(snapshot.unnamedControlCount) || 0;
  const controlsOk = beforeControls > 0
    && afterControls >= beforeControls
    && unnamedControls === 0;
  checks.controles_preservados = check(
    controlsOk,
    controlsOk
      ? `${afterControls} controles visíveis e nomeados preservados`
      : `controles antes/depois ${beforeControls}/${afterControls}; sem nome ${unnamedControls}`,
  );

  checks.main_preservado = check(
    snapshot.mainCount === 1,
    snapshot.mainCount === 1
      ? 'Exatamente um main preservado'
      : `${snapshot.mainCount ?? 0} elementos main após o override`,
  );

  const contexto = `${snapshot.rota ?? 'rota'} em ${snapshot.viewport ?? 'viewport'}`;
  const falhas = CHECK_IDS
    .filter((id) => !checks[id]?.ok)
    .map((id) => `A rota ${contexto} falhou em ${id}: ${checks[id].detalhe}.`);

  return { checks, falhas };
}

const COLLECT_BASELINE_JS = `(() => {
  const visible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  };
  const textSelector = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,label,legend,a,button,summary,[role="button"],[role="status"],[role="alert"]';
  const controlSelector = 'a[href],button,input,select,textarea,summary,[role="button"]';
  return {
    textCount: [...document.querySelectorAll(textSelector)]
      .filter((el) => visible(el) && (el.innerText || el.textContent || '').trim()).length,
    controlCount: [...document.querySelectorAll(controlSelector)].filter(visible).length,
  };
})()`;

const COLLECT_SPACED_JS = `(async () => {
  const styleElement = document.createElement('style');
  styleElement.id = 'evolvia-text-spacing-proof';
  styleElement.textContent = ${JSON.stringify(TEXT_SPACING_CSS)};
  document.head.append(styleElement);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const visible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  };
  const accessibleName = (el) => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      return labelledby.split(/\\s+/u)
        .map((id) => document.getElementById(id)?.innerText || '')
        .join(' ').replace(/\\s+/gu, ' ').trim();
    }
    return (el.getAttribute('aria-label')
      || el.getAttribute('alt')
      || el.innerText
      || el.textContent
      || '').replace(/\\s+/gu, ' ').trim();
  };
  const textSelector = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,label,legend,a,button,summary,[role="button"],[role="status"],[role="alert"]';
  const controlSelector = 'a[href],button,input,select,textarea,summary,[role="button"]';
  const textElements = [...document.querySelectorAll(textSelector)]
    .filter((el) => visible(el) && (el.innerText || el.textContent || '').trim());
  const controls = [...document.querySelectorAll(controlSelector)].filter(visible);
  const restricted = new Set(['hidden', 'clip']);
  const clippedText = textElements.filter((el) => {
    const computed = getComputedStyle(el);
    const cutX = restricted.has(computed.overflowX) && el.scrollWidth > el.clientWidth + 1;
    const cutY = restricted.has(computed.overflowY) && el.scrollHeight > el.clientHeight + 1;
    return cutX || cutY;
  }).slice(0, ${OFFENDER_LIMIT}).map((el) => {
    const computed = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      id: el.id || '',
      className: typeof el.className === 'string' ? el.className : '',
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      overflowX: computed.overflowX,
      overflowY: computed.overflowY,
    };
  });

  const probe = document.createElement('p');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;font-size:16px;width:100px;visibility:hidden';
  probe.textContent = 'prova de espaçamento';
  document.body.append(probe);
  const probeStyle = getComputedStyle(probe);
  const probeResult = {
    lineHeight: Number.parseFloat(probeStyle.lineHeight),
    letterSpacing: Number.parseFloat(probeStyle.letterSpacing),
    wordSpacing: Number.parseFloat(probeStyle.wordSpacing),
    marginBottom: Number.parseFloat(probeStyle.marginBottom),
  };
  probe.remove();

  const root = document.documentElement;
  const body = document.body;
  return {
    probe: probeResult,
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    bodyClientWidth: body?.clientWidth ?? 0,
    bodyScrollWidth: body?.scrollWidth ?? 0,
    mainCount: document.querySelectorAll('main').length,
    textCount: textElements.length,
    controlCount: controls.length,
    unnamedControlCount: controls.filter((el) => !accessibleName(el)).length,
    clippedText,
  };
})()`;

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error('A prova de espaçamento lançou uma exceção no Chromium.');
  }
  return result.result?.value;
}

async function inspectRoute(cdp, url, viewport, httpStatus) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const loaded = browserHarness.waitForPageLoad(cdp, PAGE_TIMEOUT_MS);
  await cdp.send('Page.navigate', { url: url.toString() }, PAGE_TIMEOUT_MS);
  await loaded;
  await sleep(250);

  const baseline = await evaluate(cdp, COLLECT_BASELINE_JS);
  const spaced = await evaluate(cdp, COLLECT_SPACED_JS);
  return {
    rota: browserHarness.allowedPathKey(url),
    viewport: `${viewport.width}x${viewport.height}`,
    httpStatus,
    baselineTextCount: baseline.textCount,
    baselineControlCount: baseline.controlCount,
    ...spaced,
  };
}

export function serializeManifest(manifest) {
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > MANIFEST_LIMIT_BYTES) {
    throw new Error(`O manifesto de espaçamento excedeu ${MANIFEST_LIMIT_BYTES} bytes.`);
  }
  return json;
}

export async function runCli(options = {}) {
  const timeoutMs = options.timeoutMs ?? SCRIPT_TIMEOUT_MS;
  const base = browserHarness.resolveBaseUrl(process.env.EVOLVIA_WEB_URL);
  const output = resolve(
    process.env.EVOLVIA_TEXT_SPACING_OUTPUT
      ?? 'visual-evidence/public-text-spacing-runtime.json',
  );
  const sourceSha = process.env.GITHUB_SHA ?? null;
  const resultados = [];
  const falhas = [];
  let session;

  await runWithWatchdog(async (signal) => {
    const eventPath = await browserHarness.discoverPublicEventPath(base);
    const routes = [
      ...STATIC_PATHS.map((path) => browserHarness.resolveAllowedUrl(base, path)),
      browserHarness.resolveAllowedUrl(base, eventPath),
    ];

    session = await browserHarness.openChromiumCdp();
    await session.cdp.send('Runtime.enable');
    await session.cdp.send('Page.enable');

    for (const url of routes) {
      if (signal.aborted) throw new Error('A prova de espaçamento excedeu o tempo máximo.');
      const httpStatus = await browserHarness.fetchFinalHttpStatus(url);
      for (const viewport of VIEWPORTS) {
        if (signal.aborted) throw new Error('A prova de espaçamento excedeu o tempo máximo.');
        const snapshot = await inspectRoute(session.cdp, url, viewport, httpStatus);
        const evaluation = evaluateTextSpacingSnapshot(snapshot);
        const result = {
          rota: snapshot.rota,
          viewport: snapshot.viewport,
          verificacoes: evaluation.checks,
        };
        if (snapshot.clippedText.length > 0) {
          result.elementosCortados = sanitizeClippedText(snapshot.clippedText);
        }
        resultados.push(result);
        falhas.push(...evaluation.falhas);
      }
    }

    const manifest = {
      sourceSha,
      origemPermitida: base.origin,
      navegador: 'chromium-cdp',
      criterio: 'WCAG 2.2 SC 1.4.12',
      rotas: resultados,
      ok: falhas.length === 0,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serializeManifest(manifest), 'utf8');

    if (falhas.length > 0) {
      console.error(falhas.join('\n'));
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify({ sourceSha, arquivo: output, rotas: resultados.length, ok: true }));
  }, {
    timeoutMs,
    timeoutMessage: 'A prova de espaçamento excedeu o tempo máximo.',
    cleanup: async () => browserHarness.stopChrome(session),
  });
}

if (isMainModule()) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha na prova de espaçamento de texto.');
    process.exitCode = 1;
  });
}
