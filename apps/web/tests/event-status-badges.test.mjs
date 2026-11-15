import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [globals, painel] = await Promise.all([
  readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/painel/page.tsx', import.meta.url), 'utf8'),
]);

const statusBlock = painel.match(/const statusLabels[\s\S]*?\n\};/u)?.[0] ?? '';
const organizerStatuses = [...statusBlock.matchAll(/^\s{2}([A-Z_]+):/gmu)].map((match) => match[1]);

test('cada situação do painel tem uma classe status- própria', () => {
  assert.deepEqual(organizerStatuses, [
    'DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH',
    'PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED',
  ]);
  for (const status of organizerStatuses) {
    const name = `status-${status.toLowerCase()}`;
    assert.ok(globals.includes(`.${name}`), name);
  }
});

test('recusa e falha de auditoria têm badge negativo, distinto do publicado', () => {
  assert.match(globals, /\.status-denied,/u);
  assert.match(globals, /\.status-failed\{/u);
  assert.match(globals, /\.status-denied,\.status-failed\{background:var\(--color-danger-surface\);color:var\(--color-danger\)\}/u);
  assert.doesNotMatch(globals, /\.status-denied[^{]*var\(--color-success/u);
});
