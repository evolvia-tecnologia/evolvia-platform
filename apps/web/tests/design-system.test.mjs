import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [tokens, layout, globals, events, auth, admin, adminDashboard, publicEvent, publicationEditor, publicRenderer] = await Promise.all([
  readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/auth-layout.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-admin-dashboard.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/evento/[slug]/page.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../components/publication-editor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/public-event-presentation.tsx', import.meta.url), 'utf8'),
]);

const publicationStyles = await Promise.all([
  '../components/publication-editor.module.css',
  '../components/publication-media-editor.module.css',
  '../components/publication-preview.module.css',
  '../components/publication-release-gate.module.css',
  '../components/publication-sections-editor.module.css',
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

const transversalStyles = await Promise.all([
  '../app/auth-layout.module.css',
  '../app/convites/cientificos/[token]/scientific-invitation.module.css',
  '../app/evento/[slug]/page.module.css',
  '../app/eventos/page.module.css',
  '../app/globals.css',
  '../app/home-viewport.module.css',
  '../components/event-admin-dashboard.module.css',
  '../components/legal-document-page.module.css',
  '../components/public-events-preview.module.css',
  '../components/publication-editor.module.css',
  '../components/publication-media-editor.module.css',
  '../components/publication-preview.module.css',
  '../components/publication-release-gate.module.css',
  '../components/publication-sections-editor.module.css',
  '../components/registration-form-builder.module.css',
  '../components/integrations-hub.module.css',
  '../components/scientific-eva-help.module.css',
  '../components/scientific-event-central.module.css',
  '../components/scientific-guests.module.css',
  '../components/scientific-program.module.css',
  '../components/scientific-reviews.module.css',
  '../components/scientific-structure.module.css',
  '../components/scientific-submissions.module.css',
].map(async (path) => [path, await readFile(new URL(path, import.meta.url), 'utf8')]));

test('design system preserva a assinatura azul-escura aprovada', () => {
  assert.match(tokens, /--color-brand-navy-950: #111a2f;/u);
  assert.match(tokens, /--color-brand-navy-800: #22365e;/u);
  assert.match(tokens, /--color-brand-blue-600: #0b64e5;/u);
  assert.match(tokens, /--color-focus-on-light: #0b64e5;/u);
  assert.match(tokens, /--color-focus-on-dark: #8fc5ff;/u);
  assert.match(tokens, /--color-focus: var\(--color-focus-on-dark\);/u);
  assert.match(tokens, /--color-success: #147449;/u);
  assert.match(tokens, /--color-warning: #875600;/u);
  assert.match(tokens, /--color-danger: #a52b2b;/u);
});

test('tokens são carregados antes dos estilos globais e controles herdam a fonte', () => {
  assert.ok(layout.indexOf("import './design-tokens.css';") < layout.indexOf("import './globals.css';"));
  assert.match(globals, /font-family:var\(--font-family-sans\)/u);
  assert.match(globals, /button,input,select,textarea\{font:inherit\}/u);
  assert.match(globals, /--navy:var\(--color-brand-navy-950\)/u);
});

test('marca do cabeçalho global tem foco perceptível sobre fundo escuro', () => {
  assert.match(globals, /\.brand:focus-visible\{outline:3px solid var\(--color-focus-on-dark\);outline-offset:2px\}/u);
});

test('autenticação mantém responsividade no módulo sem camada global legada', () => {
  assert.doesNotMatch(layout, /auth-compact\.css/u);
  assert.match(auth, /@media \(max-height: 900px\) and \(min-width: 1051px\)/u);
  assert.match(auth, /@media \(max-height: 720px\) and \(min-width: 1051px\)/u);
  assert.match(auth, /@media \(max-width: 1050px\)/u);
  assert.match(auth, /@media \(max-width: 720px\)/u);
  assert.match(auth, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(auth, /@media \(forced-colors: active\)/u);
  assert.match(auth, /\.input,[\s\S]*\.primaryButton \{[\s\S]*min-height: 44px/u);
});

test('catálogo, autenticação e organizador consomem a mesma paleta canônica', () => {
  assert.match(events, /var\(--color-brand-navy-950\)/u);
  assert.match(events, /var\(--color-brand-navy-800\)/u);
  assert.match(auth, /var\(--color-brand-navy-950\)/u);
  assert.match(auth, /var\(--color-brand-blue-600\)/u);
  assert.match(admin, /var\(--color-brand-navy-950\)/u);
  assert.match(admin, /var\(--color-brand-blue-600\)/u);

  for (const [name, source] of [['auth', auth], ['admin', admin]]) {
    assert.doesNotMatch(source, /#07162e|#111827|#2563eb|#1d4ed8/u, name);
  }
});

test('evento público usa a casca Evolvia sem apagar o tema do organizador', () => {
  assert.match(publicEvent, /background: var\(--color-canvas\)/u);
  assert.match(publicEvent, /--event-primary: var\(--color-brand-blue-600\)/u);
  assert.match(publicEvent, /--event-accent: var\(--color-brand-navy-800\)/u);
  assert.doesNotMatch(publicEvent, /\.siteHeader|\.platformNav/u);
  assert.doesNotMatch(publicEvent, /#0b5ec7|#174d91|#f7f7f8|#17181c/iu);

  for (const source of [publicationEditor, publicRenderer]) {
    assert.match(source, /primaryColor: '#0B64E5'/u);
    assert.match(source, /accentColor: '#22365E'/u);
  }
});

test('painel apresenta a jornada canônica sem criar ações fictícias', () => {
  for (const phase of [
    'Divulgação do evento',
    'Inscrição',
    'Área reservada do inscrito',
    'Configuração de trabalhos científicos',
    'Submissão pelo autor',
    'Avaliação científica',
    'Decisão científica',
    'Pós-aprovação e ePoster',
    'Programação científica definitiva',
    'Operação do evento',
    'Pós-evento',
  ]) {
    assert.match(adminDashboard, new RegExp(phase, 'u'), phase);
  }

  assert.match(adminDashboard, /Configuração disponível/u);
  assert.match(adminDashboard, /Em desenvolvimento/u);
  assert.match(adminDashboard, /Não se aplica/u);
  assert.match(adminDashboard, /A ficha pode ser preparada sem abrir inscrições ao público/u);
  assert.doesNotMatch(adminDashboard, /href=.*fase-(?:2|3|4|5|6|7|8|9|10|11)/u);
  assert.match(admin, /\.journeyList \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(admin, /@media \(max-width: 700px\)[\s\S]*\.journeyList \{[\s\S]*grid-template-columns: 1fr/u);\n  assert.match(adminDashboard, /<details className=\{styles\.journey\}>/u);\n  assert.match(adminDashboard, /Credenciamento e check-in/u);\n  assert.doesNotMatch(adminDashboard, /Começamos pela divulgação\. As próximas áreas entram no menu/u);
});


test('painel e Wizard consomem somente a paleta canônica', () => {
  const dashboardStart = globals.indexOf('/* Dashboard */');
  const responsiveStart = globals.indexOf('@media(max-width:1120px)');
  const workspaceStyles = globals.slice(dashboardStart, responsiveStart);

  assert.ok(dashboardStart >= 0);
  assert.ok(responsiveStart > dashboardStart);
  assert.doesNotMatch(workspaceStyles, /#[0-9a-f]{3,8}\b/iu);
  assert.match(workspaceStyles, /var\(--color-brand-navy-950\)/u);
  assert.match(workspaceStyles, /var\(--color-brand-blue-600\)/u);
  assert.match(workspaceStyles, /var\(--color-surface\)/u);
  assert.match(workspaceStyles, /var\(--color-text-muted\)/u);
  assert.match(workspaceStyles, /var\(--color-border\)/u);
  assert.match(workspaceStyles, /var\(--color-success-surface\)/u);
  assert.match(workspaceStyles, /var\(--color-warning-surface\)/u);
});
test('superfícies não referenciam tokens de design inexistentes', () => {
  const globalTokens = new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/giu)].map((match) => match[1]));

  for (const [name, source] of [
    ['catálogo', events],
    ['autenticação', auth],
    ['painel', admin],
    ['evento público', publicEvent],
    ...publicationStyles.map((source, index) => [`divulgação ${index + 1}`, source]),
  ]) {
    const available = new Set([
      ...globalTokens,
      ...[...source.matchAll(/(--[a-z0-9-]+)\s*:/giu)].map((match) => match[1]),
    ]);
    const references = [...source.matchAll(/var\((--[a-z0-9-]+)/giu)].map((match) => match[1]);

    for (const reference of references) {
      assert.ok(available.has(reference), `${name}: token ${reference} não declarado`);
    }
  }
});

test('workspace de Divulgação usa somente a paleta canônica', () => {
  for (const source of publicationStyles) {
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/iu);
    assert.match(source, /var\(--color-/u);
  }
});

test('combinações principais preservam contraste WCAG AA', () => {
  const luminance = (hex) => {
    const channels = hex.match(/[a-f\d]{2}/giu).map((channel) => Number.parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrast = (foreground, background) => {
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };

  assert.ok(contrast('#ffffff', '#111a2f') >= 4.5);
  assert.ok(contrast('#ffffff', '#22365e') >= 4.5);
  assert.ok(contrast('#ffffff', '#0b64e5') >= 4.5);
  assert.ok(contrast('#5d6f87', '#f3f6fb') >= 4.5);
  assert.ok(contrast('#147449', '#e8f8ef') >= 4.5);
  assert.ok(contrast('#875600', '#fff4da') >= 4.5);
  assert.ok(contrast('#a52b2b', '#fff0f0') >= 4.5);
});



test('tipografia transversal usa somente a escala canônica', () => {
  for (const [path, source] of transversalStyles) {
    assert.doesNotMatch(source, /font-size:\s*(?:\d|\.\d|clamp\()/iu, path);
    assert.doesNotMatch(source, /line-height:\s*(?:\d|\.\d)/iu, path);
    assert.doesNotMatch(source, /font-weight:\s*\d/iu, path);
    assert.doesNotMatch(source, /letter-spacing:\s*-?(?:\d|\.\d)/iu, path);
    assert.match(source, /font-size:\s*var\(--font-size-/u, path);
  }
});

test('CSS transversal usa somente cores da fonte canônica', () => {
  for (const [path, source] of transversalStyles) {
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/iu, path);
    assert.doesNotMatch(source, /(?:rgb|rgba)\(/iu, path);
  }
});


test('raios e sombras transversais vêm da fonte canônica', () => {
  for (const [path, source] of transversalStyles) {
    assert.doesNotMatch(source, /border-radius:\s*(?:\d+(?:\.\d+)?(?:px|rem)|\.\d+rem)/iu, path);
    assert.doesNotMatch(source, /box-shadow:\s*(?!var\(|none)(?=\S)[^;}]+/iu, path);
  }
});


test('espaçamento transversal usa somente a escala canônica', () => {
  for (const [path, source] of transversalStyles) {
    assert.doesNotMatch(source, /(?:margin|padding|gap|row-gap|column-gap)(?:-[a-z]+)?:\s*[^;}]*-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem)\b/iu, path);
  }
});
