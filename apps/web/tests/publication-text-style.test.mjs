import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPublicationRichTextSafe,
  normalizePublicationRichText,
  PublicationRichTextPolicyError,
  wrapRichTextFmt,
} from '../lib/publication-text-style.ts';

test('formatação permitida persiste ao normalizar', () => {
  const source = '@center [[fmt sans 20 navy]]**Certificado**[[/fmt]]';
  assert.equal(normalizePublicationRichText(source), source);
});

test('html, http e marcadores inválidos são recusados', () => {
  assert.throws(() => assertPublicationRichTextSafe('<b>x</b>'), PublicationRichTextPolicyError);
  assert.throws(() => assertPublicationRichTextSafe('http://inseguro.example'), PublicationRichTextPolicyError);
  assert.throws(() => assertPublicationRichTextSafe('[[fmt comic 99 purple]]x'), PublicationRichTextPolicyError);
  assert.throws(() => assertPublicationRichTextSafe('[[fmt sans 16 navy]]sem fechar'), PublicationRichTextPolicyError);
});

test('wrapRichTextFmt seleciona o trecho dentro do span', () => {
  const result = wrapRichTextFmt('Olá mundo', 4, 9, 'serif', 18, 'blue');
  assert.match(result.next, /\[\[fmt serif 18 blue\]\]mundo\[\[\/fmt\]\]/u);
  assert.equal(result.next.slice(result.from, result.to), 'mundo');
});
