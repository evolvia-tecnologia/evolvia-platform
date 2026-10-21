import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [page, consoleSource, checkIn, dashboard] = await Promise.all([
  readFile(new URL('../app/eventos/[id]/painel/show/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/show-operations-console.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/check-in-console.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8'),
]);

test('painel do show oferece relatórios, equipe e escolha dos dados da catraca', () => {
  assert.match(page, /section="show"/u);
  assert.match(page, /ShowOperationsConsole/u);
  assert.match(consoleSource, /Ingressos totais/u);
  assert.match(consoleSource, /Validados/u);
  assert.match(consoleSource, /Não validados/u);
  assert.match(consoleSource, /Relatório de acessos/u);
  assert.match(consoleSource, /Nome do participante/u);
  assert.match(consoleSource, /Tipo de ingresso/u);
  assert.match(consoleSource, /Status do ingresso \(pago, isento ou cancelado\)/u);
  assert.match(consoleSource, /Código do ingresso/u);
  assert.match(consoleSource, /shareName: false/u);
  assert.match(consoleSource, /navigator\.clipboard\?\.writeText/u);
  assert.match(consoleSource, /useState<Report \| null>\(null\)/u);
  assert.match(consoleSource, /useState\(true\)/u);
  assert.match(consoleSource, /loading \? <p role="status">Carregando operação do show…<\/p> : report &&/u);
  assert.ok(consoleSource.indexOf('useState(true)') < consoleSource.indexOf('Date.now()'));
  assert.ok(consoleSource.indexOf('loading ?') < consoleSource.indexOf('Date.now()'));
  assert.doesNotMatch(consoleSource, /suppressHydrationWarning/u);
  assert.doesNotMatch(consoleSource, /type="email"|identity_document|emailHash|registrationData/u);
  assert.match(dashboard, /Acessos e catracas/u);
  assert.match(dashboard, /painel\/show/u);
});

test('portaria distingue ingresso e equipe', () => {
  assert.match(checkIn, /kind === 'STAFF'/u);
  assert.match(checkIn, /Entrada da equipe registrada/u);
  assert.match(checkIn, /Entrada registrada/u);
  assert.match(checkIn, /painel\/show/u);
  assert.doesNotMatch(checkIn, /#[0-9a-f]{3,8}/iu);
});
