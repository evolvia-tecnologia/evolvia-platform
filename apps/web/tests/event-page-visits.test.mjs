import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { publicVisitRequest } from '../lib/public-page-visit.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a abertura conta no navegador e o relatório não identifica o visitante', async () => {
  const [page, visit, report, options] = await Promise.all([
    read('../app/evento/[slug]/page.tsx'),
    read('../components/record-public-visit.tsx'),
    read('../components/post-event-reports.tsx'),
    read('../lib/post-event-report-options.ts'),
  ]);
  const metadata = page.slice(page.indexOf('export async function generateMetadata'), page.indexOf('export default async function PublicEventPage'));
  const body = page.slice(page.indexOf('export default async function PublicEventPage'));
  assert.doesNotMatch(metadata, /RecordPublicVisit|recordPublicVisit|\/visit/u);
  assert.doesNotMatch(body, /fetch\(|recordPublicVisit\(/u);
  assert.match(body, /<RecordPublicVisit slug=\{event\.event\.slug\} \/>/u);
  assert.match(visit, /useEffect/u);
  assert.match(visit, /sent\.current === slug/u);
  assert.match(visit, /publicVisitRequest\(slug\)/u);
  assert.doesNotMatch(`${page}\n${visit}`, /userAgent|ipAddress|navigator\.userAgent/u);
  assert.match(report, /Visitas da página/u);
  assert.match(report, /Não há perfil de visitante/u);
  assert.match(report, /Vendas no período/u);
  assert.match(report, /Não informada/u);
  assert.match(report, /Nenhuma venda paga neste recorte/u);
  assert.match(options, /id: 'visits'/u);
  assert.match(options, /id: 'sales'/u);
  assert.doesNotMatch(report, /ipAddress|userAgent|navigator\.userAgent/u);
});

test('o pedido de visita não leva corpo nem cookie e omite a página de origem', () => {
  const { url, init } = publicVisitRequest('congresso-sp');
  assert.equal(url, '/api/public/events/congresso-sp/visit');
  assert.equal(init.method, 'POST');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.keepalive, true);
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(Object.hasOwn(init, 'body'), false);
  assert.equal(Object.hasOwn(init, 'headers'), false);
  assert.doesNotMatch(JSON.stringify(init), /userAgent|cookie|ipAddress|email/u);
});
