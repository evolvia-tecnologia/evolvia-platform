import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a página pública conta uma visita e o relatório não identifica o visitante', async () => {
  const [page, report, options] = await Promise.all([
    read('../app/evento/[slug]/page.tsx'),
    read('../components/post-event-reports.tsx'),
    read('../lib/post-event-report-options.ts'),
  ]);
  const metadata = page.slice(page.indexOf('export async function generateMetadata'), page.indexOf('export default async function PublicEventPage'));
  const body = page.slice(page.indexOf('export default async function PublicEventPage'));
  assert.doesNotMatch(metadata, /recordPublicVisit|\/visit/u);
  assert.match(body, /recordPublicVisit\(slug\)/u);
  assert.match(page, /method: 'POST'/u);
  assert.match(page, /\/visit/u);
  assert.match(report, /Visitas da página/u);
  assert.match(report, /Não há perfil de visitante/u);
  assert.match(report, /Vendas no período/u);
  assert.match(report, /Nenhuma venda paga neste recorte/u);
  assert.match(options, /id: 'visits'/u);
  assert.match(options, /id: 'sales'/u);
  assert.doesNotMatch(report, /ipAddress|userAgent|navigator\.userAgent/u);
});
