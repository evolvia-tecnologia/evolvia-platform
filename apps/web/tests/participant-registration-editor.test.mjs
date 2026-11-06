import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editor = await readFile(new URL('../components/participant-registration-editor.tsx', import.meta.url), 'utf8');
const area = await readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../components/participant-area.module.css', import.meta.url), 'utf8');
const tokens = await readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8');

test('editor usa sessão em memória, revisão e idempotência', () => {
  assert.match(area, /ParticipantRegistrationEditor/u);
  assert.match(editor, /authorization: `Bearer \$\{token\}`/u);
  assert.match(editor, /expectedRevision: editor\.revision/u);
  assert.match(editor, /idempotency-key/u);
  assert.match(editor, /crypto\.randomUUID/u);
  assert.match(editor, /submission\.current\?\.fingerprint !== fingerprint/u);
  assert.match(editor, /'idempotency-key': idempotencyKey/u);
  assert.doesNotMatch(editor, /localStorage|sessionStorage|document\.cookie/u);
});

test('explica campos protegidos e oferece feedback acessível', () => {
  assert.match(editor, /CPF\/documento, e-mail, categoria, lote, pagamento e dados fiscais permanecem protegidos/u);
  assert.match(editor, /role="alert"/u);
  assert.match(editor, /fieldset/u);
  assert.match(editor, /legend/u);
});

// Esta asserção substitui uma que exigia literalmente a expressão defeituosa,
// isto é, que FIXAVA o defeito: o resultado da gravação era deduzido de uma
// palavra presente no texto da mensagem, e qualquer recusa do servidor que
// contivesse "segurança" aparecia como êxito. Enquanto ela existisse, corrigir
// o defeito reprovava o teste e mantê-lo aprovava.
//
// A troca aperta em vez de afrouxar: exige resultado em estado próprio e
// proíbe explicitamente que a decisão volte a ser tomada por conteúdo de
// string, em qualquer ponto do arquivo.
test('o resultado da gravação vem de estado próprio, não de texto', () => {
  assert.match(editor, /role=\{aviso\.ok \? 'status' : 'alert'\}/u);
  assert.match(editor, /className=\{aviso\.ok \? styles\.success : styles\.error\}/u);
  assert.match(editor, /ok: true/u);
  assert.match(editor, /ok: false/u);
  assert.doesNotMatch(editor, /includes\('segurança'\)/u);
  assert.doesNotMatch(editor, /message\.includes/u);
});

test('preserva alvos, foco, reflow e cores forçadas do componente', () => {
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.match(tokens, /--space-44:\s*44px/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /max-width: 360px/u);
  assert.match(css, /forced-colors/u);
});
