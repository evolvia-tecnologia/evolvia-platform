import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('toda a plataforma monta os ajustes de acessibilidade no layout raiz', async () => {
  const [layout, panel, styles] = await Promise.all([
    readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/accessibility-panel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/accessibility-panel.module.css', import.meta.url), 'utf8'),
  ]);
  assert.match(layout, /ACCESSIBILITY_BOOT_SCRIPT/u);
  assert.match(layout, /<AccessibilityPanel \/>/u);
  assert.ok(layout.indexOf("import './globals.css';") < layout.indexOf("import './accessibility.css';"));
  assert.match(panel, /role="dialog"/u);
  assert.match(panel, /aria-modal="true"/u);
  assert.match(panel, /aria-live="polite"/u);
  assert.match(panel, /Tamanho do texto/u);
  assert.match(panel, /Espaçamento do texto/u);
  assert.match(panel, /Fonte mais legível/u);
  assert.match(panel, /Contraste alto/u);
  assert.match(panel, /Sublinhar links/u);
  assert.match(panel, /Reduzir animações/u);
  assert.match(panel, /Realçar o foco do teclado/u);
  assert.match(panel, /Áreas de toque maiores/u);
  assert.match(panel, /Restaurar padrão/u);
  assert.match(panel, /event\.key === 'Escape'/u);
  assert.match(styles, /min-height: var\(--space-44\)/u);
  assert.match(styles, /@media \(max-width: 640px\)/u);
  assert.match(styles, /forced-colors: active/u);
  assert.doesNotMatch(panel, /https?:\/\//u);
});
