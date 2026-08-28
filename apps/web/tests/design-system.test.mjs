import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [tokens, layout, globals, events, auth, admin] = await Promise.all([
  readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/auth-layout.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-admin-dashboard.module.css', import.meta.url), 'utf8'),
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
