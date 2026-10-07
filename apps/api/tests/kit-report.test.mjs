import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KIT_EXPORT_ROW_LIMIT,
  KitReportPolicyError,
  calendarDayStart,
  kitCsv,
  kitExportLimitMessage,
  normalizeKitReportQuery,
} from '../dist/kit-report.js';

test('o CSV neutraliza fórmula, aspas, acento e separador', () => {
  const csv = kitCsv([{
    protocol: 'EVO-0000000000000001',
    name: '=João "Lia"; @calc',
    requestedSizeLabel: 'M',
    deliveredSizeLabel: '+G',
    situation: 'ENTREGUE',
    at: '2026-10-07T15:00:00.000Z',
  }]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /\r\n/u);
  assert.equal(csv.includes(','), false);
  assert.match(csv, /"Protocolo";"Nome";"Tamanho solicitado";"Tamanho entregue";"Situação";"Data\/hora"/u);
  assert.match(csv, /"'=João ""Lia""; @calc";"M";"'\+G";"Entregue";"2026-10-07T15:00:00.000Z"/u);
  assert.equal(csv.includes('cpf'), false);
});

test('filtros de período, página e exportação recusam entrada inválida', () => {
  const filters = normalizeKitReportQuery({
    situation: 'ENTREGUE',
    from: '2026-10-07',
    to: '2026-10-07',
    page: '2',
    pageSize: '10',
  }, 'America/Sao_Paulo');
  assert.equal(filters.from.toISOString(), '2026-10-07T03:00:00.000Z');
  assert.equal(filters.toExclusive.toISOString(), '2026-10-08T03:00:00.000Z');
  assert.equal(filters.page, 2);
  assert.equal(filters.pageSize, 10);
  assert.equal(calendarDayStart('2026-10-07', null).toISOString(), '2026-10-07T00:00:00.000Z');

  const exported = normalizeKitReportQuery({ situation: 'PENDENTE', page: '9', pageSize: '1' }, null, { export: true });
  assert.equal(exported.page, 1);
  assert.equal(exported.pageSize, KIT_EXPORT_ROW_LIMIT);
  assert.match(kitExportLimitMessage(5001), /5001/);
  assert.match(kitExportLimitMessage(5001), /5000/);

  assert.throws(() => normalizeKitReportQuery({ situation: 'CANCELADA' }, null), KitReportPolicyError);
  assert.throws(() => normalizeKitReportQuery({ from: '2026-10-08', to: '2026-10-07' }, null), KitReportPolicyError);
  assert.throws(() => normalizeKitReportQuery({ pageSize: '51' }, null), /Quantidade da página inválida/u);
  assert.throws(() => normalizeKitReportQuery({ email: 'a@b.c' }, null), /Filtro inválido/u);
});
