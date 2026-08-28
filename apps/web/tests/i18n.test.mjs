import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LOCALE,
  ENABLED_LOCALES,
  LOCALE_METADATA,
  SUPPORTED_LOCALES,
  assertCatalogComplete,
  message,
  missingCatalogKeys,
  negotiateLocale,
  resolveLocale,
} from '../lib/i18n.ts';

test('pt-BR é padrão e único habilitado enquanto outros catálogos não forem aprovados', () => {
  assert.equal(DEFAULT_LOCALE, 'pt-BR');
  assert.deepEqual([...ENABLED_LOCALES], ['pt-BR']);
  assert.deepEqual([...SUPPORTED_LOCALES], [
    'pt-BR', 'en-US', 'es-419', 'pt-PT', 'en-GB',
    'es-ES', 'fr-FR', 'it-IT', 'de-DE', 'ru-RU',
  ]);
});

test('todo locale suportado possui metadados e direção explícita', () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.ok(LOCALE_METADATA[locale].label.length > 0, locale);
    assert.match(LOCALE_METADATA[locale].direction, /^(?:ltr|rtl)$/u, locale);
  }
});

test('normaliza BCP 47 e mantém fallback explícito para pt-BR', () => {
  assert.equal(resolveLocale(), 'pt-BR');
  assert.equal(resolveLocale('pt_BR'), 'pt-BR');
  assert.equal(resolveLocale('PT-br'), 'pt-BR');
  assert.equal(resolveLocale('idioma-nao-habilitado'), 'pt-BR');
});

test('negociação respeita conta, cookie, Accept-Language e fallback nessa ordem', () => {
  assert.equal(negotiateLocale({
    accountLocale: 'pt_BR',
    cookieLocale: 'idioma-invalido',
    acceptLanguage: 'en-US, pt-BR;q=0.8',
  }), 'pt-BR');

  assert.equal(negotiateLocale({
    cookieLocale: 'pt-BR',
    acceptLanguage: 'en-US, pt-BR;q=0.8',
  }), 'pt-BR');

  assert.equal(negotiateLocale({ acceptLanguage: 'en-US;q=0.9, pt;q=0.8' }), 'pt-BR');
  assert.equal(negotiateLocale({ acceptLanguage: '*' }), 'pt-BR');
});

test('Accept-Language inválido, excessivo ou proibido não habilita locale', () => {
  assert.equal(negotiateLocale({ acceptLanguage: 'en-US;q=2, pt-BR;q=0' }), 'pt-BR');
  assert.equal(negotiateLocale({ acceptLanguage: 'x'.repeat(1025) }), 'pt-BR');
  assert.equal(negotiateLocale({ acceptLanguage: 'ru-RU, de-DE;q=0.9' }), 'pt-BR');
});

test('validação de catálogo aponta chaves ausentes antes de habilitar locale', () => {
  const catalog = {
    greeting: { 'pt-BR': 'Olá', 'en-US': 'Hello' },
    farewell: { 'pt-BR': 'Até logo' },
  };

  assert.deepEqual(missingCatalogKeys(catalog, 'pt-BR'), []);
  assert.deepEqual(missingCatalogKeys(catalog, 'en-US'), ['farewell']);
  assert.doesNotThrow(() => assertCatalogComplete(catalog, 'pt-BR'));
  assert.throws(
    () => assertCatalogComplete(catalog, 'en-US'),
    /Catálogo en-US incompleto: farewell/u,
  );
});

test('mensagens usam fallback pt-BR, interpolação determinística e chave visível', () => {
  const catalog = {
    greeting: { 'pt-BR': 'Olá, {name}. Você tem {count} pendências.' },
    farewell: { 'pt-BR': 'Até logo' },
  };

  assert.equal(
    message(catalog, 'greeting', 'idioma-nao-habilitado', { name: 'Berg', count: 2 }),
    'Olá, Berg. Você tem 2 pendências.',
  );
  assert.equal(message(catalog, 'greeting', 'pt-BR'), 'Olá, {name}. Você tem {count} pendências.');
  assert.equal(message(catalog, 'missing'), '[missing]');
});

test('parâmetros permanecem texto puro e não são interpretados como catálogo ou HTML', () => {
  const catalog = { content: { 'pt-BR': 'Conteúdo: {value}' } };
  assert.equal(
    message(catalog, 'content', 'pt-BR', { value: '<script>não executar</script>' }),
    'Conteúdo: <script>não executar</script>',
  );
});
