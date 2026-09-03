import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '..', 'app');

const loadingSrc = readFileSync(resolve(appDir, 'loading.tsx'), 'utf8');
const errorSrc = readFileSync(resolve(appDir, 'error.tsx'), 'utf8');
const cssSrc = readFileSync(resolve(appDir, 'system-feedback.module.css'), 'utf8');

describe('loading.tsx — segurança e acessibilidade', () => {
  it('possui role="status" para leitores de tela', () => {
    assert.match(loadingSrc, /role=["']status["']/);
  });

  it('possui aria-live="polite"', () => {
    assert.match(loadingSrc, /aria-live=["']polite["']/);
  });

  it('exibe texto de carregamento em PT-BR', () => {
    assert.match(loadingSrc, /Carregando/);
  });

  it('não expõe dados técnicos', () => {
    assert.doesNotMatch(loadingSrc, /stack/i);
    assert.doesNotMatch(loadingSrc, /digest/i);
    assert.doesNotMatch(loadingSrc, /token/i);
  });
});

describe('error.tsx — segurança e acessibilidade', () => {
  it('é um Client Component', () => {
    assert.match(errorSrc, /['"]use client['"]/);
  });

  it('possui role="alert"', () => {
    assert.match(errorSrc, /role=["']alert["']/);
  });

  it('possui botão "Tentar novamente" que chama reset()', () => {
    assert.match(errorSrc, /Tentar novamente/);
    assert.match(errorSrc, /onClick=\{reset\}/);
  });

  it('possui link para página inicial', () => {
    assert.match(errorSrc, /href=["']\/["']/);
    assert.match(errorSrc, /Página inicial/);
  });

  it('não renderiza error.message no markup', () => {
    assert.doesNotMatch(errorSrc, /\{error\.message\}/);
    assert.doesNotMatch(errorSrc, /\{error\.stack\}/);
    assert.doesNotMatch(errorSrc, /\{error\.digest\}/);
  });

  it('não serializa stack, digest ou mensagem original', () => {
    const combined = errorSrc.toLowerCase();
    assert.ok(!combined.includes('json.stringify'));
    assert.ok(!combined.includes('innerhtml'));
    assert.ok(!combined.includes('dangerouslysetinnerhtml'));
  });

  it('não expõe URL, token ou dado pessoal', () => {
    assert.doesNotMatch(errorSrc, /window\.location/);
    assert.doesNotMatch(errorSrc, /document\.cookie/);
    assert.doesNotMatch(errorSrc, /localStorage/);
    assert.doesNotMatch(errorSrc, /sessionStorage/);
  });
});

describe('system-feedback.module.css — acessibilidade visual', () => {
  it('alvos de toque com mínimo 44px', () => {
    assert.match(cssSrc, /min-height:\s*44px/);
    assert.match(cssSrc, /min-width:\s*44px/);
  });

  it('respeita prefers-reduced-motion', () => {
    assert.match(cssSrc, /prefers-reduced-motion/);
  });

  it('suporta forced-colors', () => {
    assert.match(cssSrc, /forced-colors:\s*active/);
  });

  it('suporta viewport de 320px', () => {
    assert.match(cssSrc, /max-width:\s*320px/);
  });
});
