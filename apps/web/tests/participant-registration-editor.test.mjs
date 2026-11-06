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
  assert.match(editor, /publishedChoiceError\(editor\.fields, values\)/u);
  assert.match(editor, /A preferência não reserva estoque/u);
  assert.match(editor, /submission\.current\?\.fingerprint !== fingerprint/u);
  assert.match(editor, /'idempotency-key': idempotencyKey/u);
  assert.doesNotMatch(editor, /localStorage|sessionStorage|document\.cookie/u);
});

test('explica campos protegidos e oferece feedback acessível', () => {
  assert.match(editor, /CPF\/documento, e-mail, categoria, lote, pagamento e dados fiscais permanecem protegidos/u);
  assert.match(editor, /role="alert"/u);
  assert.match(editor, /role=\{message\.includes\('segurança'\) \? 'status' : 'alert'\}/u);
  assert.match(editor, /fieldset/u);
  assert.match(editor, /legend/u);
});

test('preserva alvos, foco, reflow e cores forçadas do componente', () => {
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.match(tokens, /--space-44:\s*44px/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /max-width: 360px/u);
  assert.match(css, /forced-colors/u);
});
