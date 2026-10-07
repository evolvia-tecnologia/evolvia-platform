import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('../components/kit-stock-panel.tsx', import.meta.url), 'utf8');
const desk = await readFile(new URL('../components/event-desk.tsx', import.meta.url), 'utf8');
const report = await readFile(new URL('../components/credential-operations.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../components/event-desk.module.css', import.meta.url), 'utf8');

test('organizador configura kit e o operador registra tamanho com confirmação', () => {
  assert.match(panel, /Kit e camisas/u);
  assert.match(panel, /Este evento entrega camisa por tamanho/u);
  assert.match(panel, /Estoque previsto/u);
  assert.match(panel, /Previsto/u);
  assert.match(panel, /Disponível/u);
  assert.match(panel, /Entregue/u);
  assert.match(panel, /não reserva estoque/u);
  assert.match(panel, /Salvar kit/u);
  assert.match(desk, /#kit': 'kit'/u);
  assert.match(desk, /Kit e camisas/u);
  assert.match(desk, /Preferência de tamanho/u);
  assert.match(desk, /A preferência não reserva estoque/u);
  assert.match(desk, /activePreferenceId/u);
  assert.match(desk, /O tamanho pedido não está mais disponível/u);
  assert.match(desk, /Confirmo a troca do tamanho solicitado/u);
  assert.match(desk, /Registrar kit/u);
  assert.match(desk, /Registrar material/u);
  assert.match(report, /Estoque de camisas por tamanho/u);
  assert.match(css, /\.kitRow \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 8rem auto;/u);
  assert.match(css, /@media \(max-width: 700px\) \{\s*\.kitRow \{ grid-template-columns: minmax\(0, 1fr\);/u);
});
