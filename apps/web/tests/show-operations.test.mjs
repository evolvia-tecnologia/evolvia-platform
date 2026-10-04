import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [page, checkIn, dashboard] = await Promise.all([
  readFile(new URL('../app/eventos/[id]/painel/show/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/check-in-console.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8'),
]);

test('painel do show oferece relatórios, equipe e escolha dos dados da catraca', () => {
  assert.match(page, /Ingressos totais/u);
  assert.match(page, /Validados/u);
  assert.match(page, /Não validados/u);
  assert.match(page, /Relatório de acessos/u);
  assert.match(page, /Nome do participante/u);
  assert.match(page, /Tipo de ingresso/u);
  assert.match(page, /Status do ingresso \(pago, isento ou cancelado\)/u);
  assert.match(page, /Código do ingresso/u);
  assert.match(page, /shareName: false/u);
  assert.match(page, /navigator\.clipboard\?\.writeText/u);
  assert.doesNotMatch(page, /type="email"|identity_document|emailHash|registrationData/u);
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
