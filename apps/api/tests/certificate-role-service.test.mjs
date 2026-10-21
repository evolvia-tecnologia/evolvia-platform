import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { CertificateRoleService } from '../dist/certificate-role.service.js';
import { PresenceCertificatePublicController } from '../dist/presence-certificate-public.controller.js';

const require = createRequire(import.meta.url);
const { NotFoundException, ForbiddenException, UnprocessableEntityException } = require('@nestjs/common');
const pdf = require('../dist/presence-certificate-pdf.js');
const event = { id: 'event-a', organizationId: 'org-a', endDate: null };
const code = 'ab'.repeat(16);

function harness(rows, beforeTransaction = () => {}) {
  const certificates = [];
  const audits = [];
  const queries = [];
  const setting = { enabled: true, releaseMode: 'manual', releaseDays: 0, hours: 8 };
  const reservation = { status: 'CONFIRMED', registrationData: { email: 'ana@example.test' } };
  const prisma = {
    event: { findUnique: async () => event },
    eventCertificateRoleSetting: { findFirst: async () => setting, findMany: async () => [{ ...setting, role: 'approved_submission' }] },
    eventRegistrationReservation: { findFirst: async ({ where }) => { assert.equal(where.eventId, event.id); assert.equal(where.organizationId, event.organizationId); return reservation.status === 'CONFIRMED' ? reservation : null; } },
    scientificPerson: { findMany: async () => [] },
    scientificSubmission: { findMany: async () => [] },
    $queryRaw: async (query) => {
      const sql = query.strings.join('?');
      queries.push(query);
      assert.match(sql, /author\."nameSnapshot"/u);
      assert.ok(query.values.includes(event.id));
      assert.ok(query.values.includes(event.organizationId));
      assert.match(sql, /NOT EXISTS/u);
      const cursor = sql.includes('author."id" >') ? query.values.at(-2) : null;
      return rows.filter((row) => (!cursor || row.id > cursor)
        && !certificates.some((item) => item.personId === row.personId && item.submissionId === row.submissionId)).slice(0, 80);
    },
    eventRoleCertificate: {
      findMany: async () => [],
      findFirst: async ({ where }) => certificates.find((item) => item.personId === where.personId && item.submissionId === where.submissionId) ?? null,
      create: async ({ data }) => {
        const row = { ...data, id: `cert-${certificates.length}`, issuedAt: new Date('2026-10-20T12:00:00Z') };
        certificates.push(row);
        return row;
      },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    $transaction: async (callback, options) => { beforeTransaction(setting, reservation); assert.equal(options.isolationLevel, 'Serializable'); return callback(prisma); },
  };
  const authorization = { requireRole: async (_user, organizationId) => assert.equal(organizationId, 'org-a') };
  return { service: new CertificateRoleService(prisma, authorization), certificates, audits, queries };
}

function work(index = 1) {
  return {
    id: `author-${String(index).padStart(5, '0')}`, personId: `person-${index}`, sortOrder: 1, firstAuthorOrder: 1,
    isPresenter: true, scientificName: null, nameSnapshot: 'Nome corrigido neste trabalho',
    personName: 'Nome global antigo', personEmail: 'ana@example.test', submissionId: `submission-${index}`,
    title: 'Pesquisa aprovada', status: 'ACCEPTED', ownerReservationId: 'reservation-a', authorCount: 1,
  };
}

test('certificado preserva nome corrigido do trabalho sem alterar a pessoa global', async () => {
  const row = work();
  const before = structuredClone(row);
  const h = harness([row]);
  const result = await h.service.issueEligible('organizer', event.id, 'approved_submission');
  assert.equal(result.created, 1);
  assert.equal(h.certificates[0].displayName, row.nameSnapshot);
  assert.equal(h.certificates[0].paperRole, 'Autor');
  assert.equal(h.certificates[0].organizationId, event.organizationId);
  assert.equal(h.certificates[0].eventId, event.id);
  assert.deepEqual(row, before);
  assert.doesNotMatch(JSON.stringify(h.audits), /Nome corrigido|Nome global|ana@/u);
});

test('autoria legada usa nome global e nome científico explícito mantém precedência', async () => {
  for (const [override, expected] of [[{ nameSnapshot: null }, 'Nome global antigo'], [{ scientificName: 'Nome científico' }, 'Nome científico']]) {
    const h = harness([{ ...work(), ...override }]);
    await h.service.issueEligible('organizer', event.id, 'approved_submission');
    assert.equal(h.certificates[0].displayName, expected);
  }
});


test('papel de autoria respeita primeira posição positiva e legado iniciado em zero', async () => {
  for (const [sortOrder, firstAuthorOrder, expected] of [[0, 0, 'Autor'], [1, 1, 'Autor'], [2, 1, 'Coautor'], [3, 2, 'Coautor']]) {
    const h = harness([{ ...work(), sortOrder, firstAuthorOrder }]);
    await h.service.issueEligible('organizer', event.id, 'approved_submission');
    assert.equal(h.certificates[0].paperRole, expected);
  }
});

test('emissões sucessivas avançam além de 120 autores e repetição não duplica auditoria', async () => {
  const h = harness(Array.from({ length: 121 }, (_, index) => work(index + 1)));
  const counts = [];
  for (let index = 0; index < 5; index++) counts.push((await h.service.issueEligible('organizer', event.id, 'approved_submission')).created);
  assert.deepEqual(counts, [40, 40, 40, 1, 0]);
  assert.equal(h.certificates.length, 121);
  assert.equal(h.audits.length, 121);
});

test('decisão revogada depois da seleção não gera certificado nem auditoria', async () => {
  const row = work();
  const h = harness([row], () => { row.status = 'REJECTED'; });
  await assert.rejects(() => h.service.issueEligible('organizer', event.id, 'approved_submission'), /elegibilidade.*alterada/iu);
  assert.equal(h.certificates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('desligar o papel depois da seleção impede a emissão', async () => {
  const h = harness([work()], (setting) => { setting.enabled = false; });
  await assert.rejects(() => h.service.issueEligible('organizer', event.id, 'approved_submission'), /liberado/iu);
  assert.equal(h.certificates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('emissão relê nome e carga no momento da gravação', async () => {
  const row = work();
  const h = harness([row], (setting) => { row.nameSnapshot = 'Nome corrigido mais recente'; setting.hours = 12; });
  await h.service.issueEligible('organizer', event.id, 'approved_submission');
  assert.equal(h.certificates[0].displayName, 'Nome corrigido mais recente');
  assert.equal(h.certificates[0].hours, 12);
});

test('participante com inscrição cancelada entre consulta e emissão não recebe certificado', async () => {
  const h = harness([work()], (_setting, reservation) => { reservation.status = 'CANCELLED'; });
  await assert.rejects(() => h.service.participantIssue({ eventId: event.id, organizationId: event.organizationId, reservationId: 'reservation-a', status: 'CONFIRMED', registrationData: { email: 'ana@example.test' }, eventEndDate: null }), /inscrição confirmada/iu);
  assert.equal(h.certificates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('PDF de papel usa o mesmo renderizador e mantém taxa zero', async () => {
  const original = pdf.certificatePdf;
  const view = { title: 'Certificado', body: 'Autoria confirmada', displayName: 'Ana', eventName: 'Congresso', hours: 8, issuedAt: '2026-10-20T12:00:00Z' };
  const service = new CertificateRoleService({}, {});
  service.publicView = async (received) => { assert.equal(received, code); return view; };
  let pages;
  try {
    pdf.certificatePdf = (input) => { pages = input; return Buffer.from('%PDF-1.4'); };
    const result = await service.publicPdf(code);
    assert.equal(result.feeCents, 0);
    assert.equal(result.bytes.toString(), '%PDF-1.4');
    assert.deepEqual(pages, [{ ...view, code }]);
    pdf.certificatePdf = () => { throw new pdf.CertificateTextUnsupportedError(['🧪']); };
    await assert.rejects(() => service.publicPdf(code), (error) => error instanceof UnprocessableEntityException && /Nada foi trocado/u.test(error.message));
  } finally { pdf.certificatePdf = original; }
});

test('rota PDF mantém participação e só usa fallback de papel após 404', async () => {
  let roleCalls = 0;
  const response = { setHeader() {}, end(bytes) { this.bytes = bytes; } };
  const roles = { publicPdf: async () => { roleCalls++; return { bytes: Buffer.from('role') }; } };
  const participation = { publicPdf: async () => ({ bytes: Buffer.from('participation') }) };
  const controller = new PresenceCertificatePublicController(participation, roles);
  await controller.pdf({}, code, response);
  assert.equal(response.bytes.toString(), 'participation');
  assert.equal(roleCalls, 0);
  participation.publicPdf = async () => { throw new NotFoundException(); };
  await controller.pdf({}, code, response);
  assert.equal(response.bytes.toString(), 'role');
  assert.equal(roleCalls, 1);
  participation.publicPdf = async () => { throw new ForbiddenException(); };
  await assert.rejects(() => controller.pdf({}, code, response), ForbiddenException);
  assert.equal(roleCalls, 1);
});

