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

function ruleBody(source, selector) {
  const rules = source.match(/[^{}]+\{[^}]*\}/gu) ?? [];
  const rule = rules.find((candidate) => {
    const head = candidate.slice(0, candidate.indexOf('{'));
    return head.split(',').some((part) => part.trim() === selector);
  });
  assert.ok(rule, selector);
  return rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}'));
}

test('recusa e falha de auditoria têm badge negativo, distinto do publicado', () => {
  const denied = ruleBody(globals, '.status-denied');
  const failed = ruleBody(globals, '.status-failed');
  assert.equal(denied, failed);
  assert.match(denied, /background\s*:\s*var\(--color-danger-surface\)/u);
  assert.match(denied, /color\s*:\s*var\(--color-danger\)/u);
  assert.doesNotMatch(denied, /var\(--color-success/u);
});
