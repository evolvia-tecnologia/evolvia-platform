import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [globals, labels, painel, card, workspace, dashboard, releaseGate, tokens] = await Promise.all([
  readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  readFile(new URL('../lib/event-status-labels.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/painel/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/organizer-event-card.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-workspace.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/publication-release-gate.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8'),
]);

const statusBlock = labels.match(/export const EVENT_STATUS_LABELS = \{[\s\S]*?\n\} as const;/u)?.[0] ?? '';
const organizerStatuses = [...statusBlock.matchAll(/^\s{2}([A-Z_]+):/gmu)].map((match) => match[1]);

test('as oito situações saem de um único módulo', () => {
  assert.match(labels, /export function eventStatusLabel/u);
  assert.match(painel, /OrganizerEventCard/u);
  for (const source of [card, workspace, dashboard]) {
    assert.match(source, /eventStatusLabel/u);
    assert.doesNotMatch(source, /const statusLabels/u);
  }
  assert.match(releaseGate, /EVENT_STATUS_LABELS/u);
  assert.doesNotMatch(releaseGate, /const STATUS_LABELS/u);
});

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
  const line = source.split('\n').find((entry) => {
    const trimmed = entry.trim();
    if (!trimmed || trimmed.startsWith('@') || !trimmed.includes('{')) return false;
    const head = trimmed.slice(0, trimmed.indexOf('{'));
    return head.split(',').some((part) => part.trim() === selector);
  });
  assert.ok(line, selector);
  return line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
}

function tokenHex(name, seen = new Set()) {
  assert.equal(seen.has(name), false, name);
  seen.add(name);
  const declaration = tokens.match(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'u'));
  assert.ok(declaration, name);
  const raw = declaration[1].trim();
  const nested = raw.match(/^var\((--[a-z0-9-]+)\)$/u);
  if (nested) return tokenHex(nested[1], seen);
  assert.match(raw, /^#[0-9a-f]{6}$/iu, name);
  return raw.toLowerCase();
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/giu).map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
}

function painted(selector) {
  const body = ruleBody(globals, selector);
  const background = body.match(/background\s*:\s*var\((--[a-z0-9-]+)\)/u);
  const color = body.match(/(?:^|;)color\s*:\s*var\((--[a-z0-9-]+)\)/u);
  assert.ok(background, `${selector} background`);
  assert.ok(color, `${selector} color`);
  return { body, foreground: tokenHex(color[1]), background: tokenHex(background[1]) };
}

test('recusa e falha de auditoria têm badge negativo, distinto do publicado', () => {
  const denied = ruleBody(globals, '.status-denied');
  const failed = ruleBody(globals, '.status-failed');
  // O mesmo par de perigo é deliberado: o rótulo separa recusa de falha, e suspenso de cancelado.
  assert.equal(denied, failed);
  assert.equal(ruleBody(globals, '.status-suspended'), ruleBody(globals, '.status-cancelled'));
  assert.match(denied, /background\s*:\s*var\(--color-danger-surface\)/u);
  assert.match(denied, /color\s*:\s*var\(--color-danger\)/u);
  assert.doesNotMatch(denied, /var\(--color-success/u);
});

test('o contraste do selo usa o hex declarado no token, não um literal solto', () => {
  for (const status of [...organizerStatuses, 'DENIED', 'FAILED']) {
    const paint = painted(`.status-${status.toLowerCase()}`);
    assert.ok(contrast(paint.foreground, paint.background) >= 4.5, status);
  }
});

test('a leitura da regra ignora um override dentro de @media', () => {
  const source = [
    '@media (forced-colors: active){.status-denied{background:var(--color-success-surface);color:var(--color-success)}}',
    '.status-denied,.status-failed{background:var(--color-danger-surface);color:var(--color-danger)}',
  ].join('\n');
  const body = ruleBody(source, '.status-denied');
  assert.match(body, /var\(--color-danger\)/u);
  assert.doesNotMatch(body, /success/u);
});
