import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../components/participant-area.module.css', import.meta.url), 'utf8');

test('entrada e saída usam sessão opaca apenas em memória', () => {
  assert.match(component, /useState<string \| null>\(initialAccessToken \?\? null\)/u);
  assert.match(component, /participant\/sessions/u);
  assert.match(component, /method: 'DELETE'/u);
  assert.doesNotMatch(component, /localStorage|sessionStorage|document\.cookie/u);
  assert.match(component, /response\.text\(\)/u);
  assert.match(component, /JSON\.parse\(raw\)/u);
  assert.doesNotMatch(component, /\.json\(\)/u);
});

test('credencial só aparece com inscrição confirmada e não expõe PII', () => {
  assert.match(component, /area\.credential &&/u);
  assert.match(component, /Credencial de acesso/u);
  assert.doesNotMatch(component, /registrationData|full_name|preferred_name|emailHash|identityHash/u);
});

test('contratos mínimos de acessibilidade e reflow estão presentes', () => {
  assert.match(component, /aria-labelledby/u);
  assert.match(component, /role="alert"/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /max-width: 360px/u);
  assert.match(css, /prefers-reduced-motion/u);
  assert.match(css, /forced-colors/u);
});
