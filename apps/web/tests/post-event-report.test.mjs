import assert from 'node:assert/strict';
import test from 'node:test';
import { postEventReportCsv, reportCsvCell, reportPercent } from '../lib/post-event-report.ts';

test('percentuais indicam ausência de população sem fabricar taxa zero', () => {
  assert.equal(reportPercent(0, 0), '—'); assert.equal(reportPercent(1, 3), '33,3%'); assert.equal(reportPercent(0, 5), '0%');
});
test('CSV protege fórmulas, aspas, quebras de linha e preserva rótulos em português', () => {
  assert.equal(reportCsvCell('=CMD()'), '"\'=CMD()"');
  assert.equal(reportCsvCell(' \t@SUM(1)'), '"\' \t@SUM(1)"');
  assert.equal(reportCsvCell('Grupo "A"; B\nC'), '"Grupo ""A""; B\nC"');
});
test('exportação contém metadados, denominadores e ressalvas, sem mailing nominal', () => {
  const data = { event: { name: 'Congresso', profileLabel: 'Científico', timeZone: 'UTC' }, generatedAt: '2026-10-10T12:00:00Z', formRevision: 2, ageReferenceDay: '2026-10-10', registration: { confirmed: 2, present: 1, absent: 1, pending: 0, expired: 0, cancelled: 0 }, categories: [{ label: 'A', registered: 2, present: 1 }], fields: [{ label: 'Escolaridade', eligible: 2, presentEligible: 1, notCollected: 1, notApplicable: 0, buckets: [{ label: 'Não informado', registered: 2, present: 1 }] }], firstCheckInByDay: [{ label: '2026-10-10', count: 1 }], firstCheckInByHour: [], payment: null, scientific: null, limitations: ['Primeiro credenciamento não comprova presença diária.'] };
  const csv = postEventReportCsv(data);
  assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /Revisão da ficha/); assert.match(csv, /Escolaridade/); assert.match(csv, /Não coletado nessa versão/); assert.match(csv, /presença diária/); assert.doesNotMatch(csv, /Email|CPF|Nome completo/);
});
