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

test('design system preserva a assinatura azul-escura aprovada', () => {
  assert.match(tokens, /--color-brand-navy-950: #111a2f;/u);
  assert.match(tokens, /--color-brand-navy-800: #22365e;/u);
  assert.match(tokens, /--color-brand-blue-600: #0b64e5;/u);
  assert.match(tokens, /--color-focus: #8fc5ff;/u);
});

test('tokens são carregados antes dos estilos globais e controles herdam a fonte', () => {
  assert.ok(layout.indexOf("import './design-tokens.css';") < layout.indexOf("import './globals.css';"));
  assert.match(globals, /font-family:var\(--font-family-sans\)/u);
  assert.match(globals, /button,input,select,textarea\{font:inherit\}/u);
  assert.match(globals, /--navy:var\(--color-brand-navy-950\)/u);
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
  assert.match(publicEvent, /\.platformNav a:hover[\s\S]*background: var\(--color-surface-soft\)/u);
  assert.match(publicEvent, /@media \(max-width: 640px\)[\s\S]*\.platformNav \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
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

  assert.match(adminDashboard, /Disponível agora/u);
  assert.match(adminDashboard, /Bloqueada pelo Gate anterior/u);
  assert.match(adminDashboard, /Não se aplica ao perfil atual/u);
  assert.match(adminDashboard, /Este mapa não libera inscrições/u);
  assert.doesNotMatch(adminDashboard, /href=.*fase-(?:2|3|4|5|6|7|8|9|10|11)/u);
  assert.match(admin, /\.journeyList \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(admin, /@media \(max-width: 700px\)[\s\S]*\.journeyList \{[\s\S]*grid-template-columns: 1fr/u);
});

test('superfícies não referenciam tokens de design inexistentes', () => {
  const globalTokens = new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/giu)].map((match) => match[1]));

  for (const [name, source] of [
    ['catálogo', events],
    ['autenticação', auth],
    ['painel', admin],
    ['evento público', publicEvent],
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
});
