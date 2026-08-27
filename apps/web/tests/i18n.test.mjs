import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LOCALE,
  ENABLED_LOCALES,
  message,
  resolveLocale,
} from '../lib/i18n.ts';

test('pt-BR é o idioma padrão e único habilitado sem catálogo aprovado adicional', () => {
  assert.equal(DEFAULT_LOCALE, 'pt-BR');
  assert.deepEqual([...ENABLED_LOCALES], ['pt-BR']);
});

test('locale desconhecido cai explicitamente para pt-BR', () => {
  assert.equal(resolveLocale(), 'pt-BR');
  assert.equal(resolveLocale('pt_BR'), 'pt-BR');
  assert.equal(resolveLocale('idioma-nao-habilitado'), 'pt-BR');
});

test('catálogo usa fallback pt-BR e denuncia chave ausente', () => {
  const catalog = {
    greeting: { 'pt-BR': 'Olá' },
  };

  assert.equal(message(catalog, 'greeting', 'idioma-nao-habilitado'), 'Olá');
  assert.equal(message(catalog, 'missing'), '[missing]');
});
