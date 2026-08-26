import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contrastRatio,
  normalizeEventPublicationTheme,
  projectPublicEventPublicationTheme,
  readableTextColor,
} from '../dist/event-publication/event-publication-theme.policy.js';

test('normaliza somente tokens visuais controlados e cores #RRGGBB', () => {
  assert.deepEqual(normalizeEventPublicationTheme({
    preset: 'DEFAULT',
    fontScale: 'LARGE',
    contentWidth: 'WIDE',
    primaryColor: '#0b5ec7',
    accentColor: '#174d91',
  }), {
    preset: 'DEFAULT',
    fontScale: 'LARGE',
    contentWidth: 'WIDE',
    primaryColor: '#0B5EC7',
    accentColor: '#174D91',
  });
});

test('rejeita CSS, formatos abreviados, transparência e chaves arbitrárias', () => {
  for (const theme of [
    { primaryColor: '#fff' },
    { primaryColor: 'rgba(0,0,0,.5)' },
    { accentColor: 'url(javascript:alert(1))' },
    { customCss: 'body{display:none}' },
  ]) {
    assert.throws(() => normalizeEventPublicationTheme(theme));
  }
});

test('deriva texto AA legível sem aceitar a cor de contraste do cliente', () => {
  const projected = projectPublicEventPublicationTheme({
    primaryColor: '#FDE047',
    accentColor: '#111827',
  });
  assert.ok(projected);
  assert.equal(projected.onPrimaryColor, '#000000');
  assert.equal(projected.onAccentColor, '#FFFFFF');
  assert.ok(contrastRatio(projected.onPrimaryColor, projected.primaryColor) >= 4.5);
  assert.ok(contrastRatio(projected.onAccentColor, projected.accentColor) >= 4.5);
  assert.equal(readableTextColor('#FFFFFF'), '#000000');
});

test('garante contraste AA para uma grade representativa de cores', () => {
  for (const red of [0, 51, 102, 123, 153, 204, 255]) {
    for (const green of [0, 51, 102, 123, 153, 204, 255]) {
      for (const blue of [0, 51, 102, 123, 153, 204, 255]) {
        const color = `#${[red, green, blue]
          .map((channel) => channel.toString(16).padStart(2, '0'))
          .join('')}`;
        assert.ok(contrastRatio(readableTextColor(color), color) >= 4.5, color);
      }
    }
  }
});

test('configuração legada inválida recebe fallback seguro no contrato público', () => {
  assert.equal(projectPublicEventPublicationTheme({ customCss: 'body{}' }), null);
  assert.equal(projectPublicEventPublicationTheme(['DEFAULT']), null);
});
