import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const report = await readFile(new URL('../components/kit-report.tsx', import.meta.url), 'utf8');
const desk = await readFile(new URL('../components/event-desk.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../components/event-desk.module.css', import.meta.url), 'utf8');

test('o relatório de kits filtra, pagina e exporta só para o organizador', () => {
  assert.match(report, /Relatório de kits/u);
  assert.match(report, /não reserva estoque/u);
  assert.match(report, /Carregando relatório/u);
  assert.match(report, /Nenhuma inscrição corresponde a estes filtros/u);
  assert.match(report, /role="alert"/u);
  assert.match(report, /Tamanho solicitado/u);
  assert.match(report, /Tamanho entregue/u);
  assert.match(report, /Exportar CSV/u);
  assert.match(report, /organizer && <button type="button" onClick=\{\(\) => void download\(\)\}/u);
  assert.match(report, /no máximo 5\.000/u);
  assert.match(report, /Anterior/u);
  assert.match(report, /Próxima/u);
  assert.match(desk, /#relatorio-kits': 'kit-report'/u);
  assert.match(desk, /hashchange/u);
  assert.match(desk, /Relatório de kits/u);
  assert.match(css, /\.kitFilters \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/u);
  assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*\.kitFilters \{ grid-template-columns: minmax\(0, 1fr\);/u);
});
