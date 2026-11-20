import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { registrationTermsUploadFileName } from '../lib/registration-terms-upload.ts';

const validName = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,70}\.pdf$/iu;

test('nome PDF comum permanece legível e dentro do contrato', async () => {
  assert.equal(await registrationTermsUploadFileName('Politica de Privacidade (2026).pdf'),
    'Politica de Privacidade (2026).pdf');
});

test('nome excessivo é encurtado sem perder extensão e sem colidir por truncamento', async () => {
  const a = `Termos de inscrição ${'A'.repeat(200)}.pdf`;
  const b = `Termos de inscrição ${'A'.repeat(199)}B.pdf`;
  const shortA = await registrationTermsUploadFileName(a);
  const shortB = await registrationTermsUploadFileName(b);
  for (const name of [shortA, shortB]) {
    assert.match(name, validName);
    assert.ok(name.length <= 120);
    assert.ok(name.endsWith('.pdf'));
  }
  assert.notEqual(shortA, shortB);
  assert.equal(shortA, await registrationTermsUploadFileName(a));
});

test('Unicode, caracteres proibidos e caminhos são normalizados sem exceder limite', async () => {
  const original = `C:\\pasta\\${'𐐀'.repeat(100)} : <termos>.PDF`;
  const name = await registrationTermsUploadFileName(original);
  assert.match(name, validName);
  assert.ok(name.length <= 120);
  assert.doesNotMatch(name, /[\\/:<>]/u);
  assert.ok(name.endsWith('.pdf'));
});

test('não transforma extensão inválida em PDF', async () => {
  await assert.rejects(registrationTermsUploadFileName('termos.html'), /extensão \.pdf/u);
});

test('formulário envia nome normalizado e mantém conteúdo PDF inalterado', async () => {
  const source = await readFile(new URL('../components/registration-form-builder.tsx', import.meta.url), 'utf8');
  assert.match(source, /await registrationTermsUploadFileName\(termsFile\.name\)/u);
  assert.match(source, /body: JSON\.stringify\(\{ contentBase64, fileName \}\)/u);
  assert.doesNotMatch(source, /fileName: termsFile\.name/u);
  assert.match(source, /reader\.readAsDataURL\(termsFile\)/u);
});
