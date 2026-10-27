import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const desk = await readFile(new URL('../components/event-desk.tsx', import.meta.url), 'utf8');
const help = await readFile(new URL('../components/scientific-eva-help.tsx', import.meta.url), 'utf8');

test('o posto marca o dia e desfaz sem apagar, com a EVA fora do painel', () => {
  assert.match(desk, /Marcar presença de hoje/);
  assert.match(desk, /Desfazer entrada/);
  assert.match(desk, /Desfazer material/);
  assert.match(desk, /Desfazer presença de hoje/);
  assert.match(desk, /check-in\/reverse/);
  assert.match(desk, /day-presence\/reverse/);
  assert.match(desk, /continua na auditoria/);
  assert.match(desk, /EvaScreenSupport/);
  assert.doesNotMatch(desk, /localStorage|sessionStorage|emailHash|openai/);
  const helpAt = desk.indexOf('<EvaScreenSupport');
  const panelEnd = desk.lastIndexOf('</section>}');
  assert.ok(helpAt > panelEnd);
  assert.match(help, /não envia dados pessoais, documentos ou segredos para fora do Evolvia/);
});
