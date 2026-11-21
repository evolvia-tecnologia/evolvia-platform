import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCESSIBILITY_BOOT_SCRIPT,
  ACCESSIBILITY_STORAGE_KEY,
  applyAccessibilityPreferences,
  parseAccessibilityPreferences,
} from '../lib/accessibility-preferences.ts';

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/giu).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('preferências inválidas voltam ao padrão e não ligam ajuste', () => {
  assert.deepEqual(parseAccessibilityPreferences(null), {
    text: '100', spacing: 'default', font: 'default', contrast: 'system', links: 'off', motion: 'system', focus: 'default', targets: 'default', reading: 'off',
  });
  assert.equal(parseAccessibilityPreferences('{').text, '100');
  assert.equal(parseAccessibilityPreferences('{"text":"999","contrast":"alto","reading":"ligado"}').contrast, 'system');
  assert.equal(parseAccessibilityPreferences('{"reading":"ligado"}').reading, 'off');
  assert.equal(parseAccessibilityPreferences('{"reading":"on"}').reading, 'on');
  assert.equal(parseAccessibilityPreferences('{"text":"150","spacing":"wide","font":"readable","contrast":"high","links":"on","motion":"reduce","focus":"strong","targets":"large"}').text, '150');
});

test('só atributos escolhidos entram no documento', () => {
  const root = { attributes: new Map(), setAttribute(name, value) { this.attributes.set(name, value); }, removeAttribute(name) { this.attributes.delete(name); } };
  root.setAttribute('data-a11y-text', '150');
  applyAccessibilityPreferences(root, parseAccessibilityPreferences(null));
  assert.equal(root.attributes.size, 0);
  applyAccessibilityPreferences(root, parseAccessibilityPreferences('{"text":"125","contrast":"high","links":"on","reading":"on"}'));
  assert.equal(root.attributes.get('data-a11y-text'), '125');
  assert.equal(root.attributes.get('data-a11y-contrast'), 'high');
  assert.equal(root.attributes.get('data-a11y-links'), 'on');
  assert.equal(root.attributes.get('data-a11y-reading'), 'on');
  assert.equal(root.attributes.has('data-a11y-font'), false);
  applyAccessibilityPreferences(root, parseAccessibilityPreferences('{"reading":"off"}'));
  assert.equal(root.attributes.has('data-a11y-reading'), false);
});

test('o script inicial usa a mesma chave e recusa texto solto', async () => {
  const { readFile } = await import('node:fs/promises');
  const sheet = await readFile(new URL('../app/accessibility.css', import.meta.url), 'utf8');
  assert.match(ACCESSIBILITY_BOOT_SCRIPT, new RegExp(ACCESSIBILITY_STORAGE_KEY, 'u'));
  assert.match(ACCESSIBILITY_BOOT_SCRIPT, /data-a11y-contrast/u);
  assert.match(ACCESSIBILITY_BOOT_SCRIPT, /data-a11y-reading/u);
  assert.doesNotMatch(ACCESSIBILITY_BOOT_SCRIPT, /innerHTML|eval\(/u);
  assert.match(sheet, /html\[data-a11y-contrast="high"\]/u);
  assert.match(sheet, /html\[data-a11y-reading="on"\]/u);
  assert.match(sheet, /@media print[\s\S]*\[data-a11y-chrome\]/u);
  const readingRule = sheet.slice(sheet.indexOf('html[data-a11y-reading="on"]'));
  assert.doesNotMatch(readingRule, /\bimg\b|\bsvg\b|\bcanvas\b|\bvideo\b/u);
  assert.match(sheet, /prefers-contrast: more/u);
  assert.match(sheet, /html:not\(\[data-a11y-contrast="off"\]\)/u);
  assert.ok(contrastRatio('#121212', '#ffffff') >= 7);
  assert.ok(contrastRatio('#ffffff', '#003399') >= 4.5);
});
