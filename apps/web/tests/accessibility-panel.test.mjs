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
  assert.match(layout, /className="skip-link" href="#conteudo-principal"/u);
  assert.match(layout, /id="conteudo-principal" tabIndex=\{-1\}/u);
  assert.match(layout, /data-a11y-chrome/u);
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
  assert.match(panel, /Modo de leitura/u);
  assert.match(panel, /Ler esta página/u);
  assert.match(panel, /Parar leitura/u);
  assert.match(panel, /Não há texto legível nesta página/u);
  assert.match(panel, /não está disponível neste navegador/u);
  assert.match(panel, /speechSupport === 'ready'/u);
  assert.match(panel, /Restaurar padrão/u);
  assert.match(panel, /event\.key === 'Escape'/u);
  assert.match(panel, /document\.activeElement === dialogRef\.current/u);
  assert.match(panel, /item\.tabIndex !== -1/u);
  assert.match(panel, /tabIndex=\{-1\} aria-hidden="true"/u);
  assert.match(styles, /min-height: var\(--space-44\)/u);
  assert.match(styles, /@media \(max-width: 640px\)/u);
  assert.match(styles, /forced-colors: active/u);
  assert.doesNotMatch(panel, /https?:\/\//u);
});
