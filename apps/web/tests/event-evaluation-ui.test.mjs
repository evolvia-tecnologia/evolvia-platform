import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('organizador configura, consulta e exporta apenas pela API do evento', async () => {
  const source = await read('../components/event-evaluation-admin.tsx');
  assert.match(source, /\/events\/\$\{eventId\}\/evaluation/u);
  assert.match(source, /\/evaluation\/responses/u);
  assert.match(source, /text\/csv/u);
  assert.match(source, /\\uFEFF/u);
  assert.match(source, /\^\[=\+\\-@\]/u);
  assert.match(source, /document\.body\.appendChild\(link\)/u);
  assert.match(source, /Avaliação aberta/u);
});

test('participante responde com sessão e idempotência', async () => {
  const source = await read('../components/event-evaluation-form.tsx');
  assert.match(source, /authorization: `Bearer \$\{token\}`/u);
  assert.match(source, /typeof crypto\.randomUUID === 'function'/u);
  assert.match(source, /type="radio"/u);
  assert.match(source, /checked=\{answers\[question\.id\] === value\}/u);
  assert.match(source, /maxLength=\{1000\}/u);
  assert.match(source, /role="status"/u);
});

test('estilos preservam foco, mobile, movimento reduzido e cores forçadas', async () => {
  const css = await read('../components/event-evaluation.module.css');
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /prefers-reduced-motion/u);
  assert.match(css, /forced-colors/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
});
