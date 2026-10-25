import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CertificateRolePolicyError,
  canIssueActivityCertificate,
  canIssueApprovedWorkCertificate,
  canIssueGuestCertificate,
  canIssuePresentationCertificate,
  canIssueReviewerCertificate,
  canReleaseRole,
  certificateRoleFeeCents,
  normalizeRoleSetting,
  participantOwnsScientificPerson,
  publicRoleCertificateView,
  registrationEmail,
  workPaperRole,
} from '../dist/certificate-role.policy.js';

const NOW = new Date('2026-10-02T15:00:00.000Z');
const END = new Date('2026-10-01T02:00:00.000Z');

test('papéis novos não têm taxa e nascem com liberação explícita', () => {
  assert.equal(certificateRoleFeeCents(), 0);
  const setting = normalizeRoleSetting('activity', {
    enabled: false,
    releaseMode: 'manual',
    releaseDays: 0,
    hours: null,
    expectedRevision: 0,
    organizationId: 'outra',
    eventId: 'outro',
  });
  assert.equal(setting.enabled, false);
  assert.equal(setting.organizationId, undefined);
  assert.equal(setting.eventId, undefined);
  assert.throws(() => normalizeRoleSetting('participation', { enabled: true, releaseMode: 'manual', releaseDays: 0, expectedRevision: 0 }), CertificateRolePolicyError);
  assert.throws(() => normalizeRoleSetting('activity', { enabled: true, releaseMode: 'manual', releaseDays: 0, title: 'Oi {EMAIL}', expectedRevision: 0 }), CertificateRolePolicyError);
});

test('liberação manual abre na hora e a automática espera o fim no fuso de São Paulo', () => {
  assert.equal(canReleaseRole({ enabled: false, releaseMode: 'manual', releaseDays: 0, eventEndDate: END, now: NOW }), false);
  assert.equal(canReleaseRole({ enabled: true, releaseMode: 'manual', releaseDays: 0, eventEndDate: null, now: NOW }), true);
  assert.equal(canReleaseRole({ enabled: true, releaseMode: 'after_end', releaseDays: 1, eventEndDate: null, now: NOW }), false);
  assert.equal(canReleaseRole({ enabled: true, releaseMode: 'after_end', releaseDays: 1, eventEndDate: END, now: new Date('2026-10-01T02:30:00.000Z') }), false);
  assert.equal(canReleaseRole({ enabled: true, releaseMode: 'after_end', releaseDays: 1, eventEndDate: END, now: NOW }), true);
});

test('atividade, trabalho e papéis científicos exigem a evidência canônica', () => {
  assert.equal(canIssueActivityCertificate({ releaseOpen: true, status: 'CONFIRMED', hasAccess: true }), true);
  assert.equal(canIssueActivityCertificate({ releaseOpen: true, status: 'CONFIRMED', hasAccess: false }), false);
  assert.equal(canIssueActivityCertificate({ releaseOpen: true, status: 'PENDING_PAYMENT', hasAccess: true }), false);
  assert.equal(canIssueActivityCertificate({ releaseOpen: false, status: 'CONFIRMED', hasAccess: true }), false);
  assert.equal(canIssueApprovedWorkCertificate({ releaseOpen: true, status: 'ACCEPTED', isAuthor: true }), true);
  assert.equal(canIssueApprovedWorkCertificate({ releaseOpen: true, status: 'ACCEPTED_WITH_CHANGES', isAuthor: true }), true);
  assert.equal(canIssueApprovedWorkCertificate({ releaseOpen: true, status: 'REJECTED', isAuthor: true }), false);
  assert.equal(canIssueApprovedWorkCertificate({ releaseOpen: true, status: 'SUBMITTED', isAuthor: true }), false);
  assert.equal(canIssuePresentationCertificate({ releaseOpen: true, status: 'ACCEPTED', isPresenter: true }), true);
  assert.equal(canIssuePresentationCertificate({ releaseOpen: true, status: 'ACCEPTED', isPresenter: false }), false);
  assert.equal(canIssueGuestCertificate({ releaseOpen: true, invitationStatus: 'CONFIRMED' }), true);
  assert.equal(canIssueGuestCertificate({ releaseOpen: true, invitationStatus: 'SENT' }), false);
  assert.equal(canIssueReviewerCertificate({ releaseOpen: true, submittedWithoutConflict: true }), true);
  assert.equal(canIssueReviewerCertificate({ releaseOpen: true, submittedWithoutConflict: false }), false);
  assert.equal(workPaperRole(0), 'Autor');
  assert.equal(workPaperRole(1), 'Coautor');
});

test('o participante não recebe certificado de outra pessoa', () => {
  assert.equal(registrationEmail({ email: ' Ana@Evento.com ' }), 'ana@evento.com');
  assert.equal(registrationEmail({ email: 'sem-arroba' }), null);
  assert.equal(participantOwnsScientificPerson({
    personEmail: 'Ana@Evento.com',
    registrationEmail: 'ana@evento.com',
    authorCount: 4,
    ownerReservationId: 'reserva-a',
    reservationId: 'reserva-b',
  }), true);
  assert.equal(participantOwnsScientificPerson({
    personEmail: 'outro@evento.com',
    registrationEmail: 'ana@evento.com',
    authorCount: 3,
    ownerReservationId: 'reserva-a',
    reservationId: 'reserva-a',
  }), false);
  assert.equal(participantOwnsScientificPerson({
    personEmail: null,
    registrationEmail: 'ana@evento.com',
    authorCount: 1,
    ownerReservationId: 'reserva-a',
    reservationId: 'reserva-a',
  }), true);
});

test('a consulta pública do papel não devolve identificador interno', () => {
  const view = publicRoleCertificateView({
    role: 'approved_submission',
    eventName: 'Congresso',
    displayName: 'Ana Silva',
    hours: 8,
    issuedAt: '2026-10-06T12:00:00.000Z',
    code: 'ab'.repeat(16),
    title: 'Certificado de trabalho',
    body: '**{NOME}** foi {PAPEL} de **{TITULO}** em **{EVENTO}**.',
    subjectLabel: 'Estudo clínico',
    paperRole: 'Autora',
  });
  assert.equal(view.feeCents, 0);
  assert.equal(view.role, 'approved_submission');
  assert.equal(view.body, '**Ana Silva** foi Autora de **Estudo clínico** em **Congresso**.');
  assert.equal(view.hasArt, false);
  assert.deepEqual(Object.keys(view).sort(), ['artAlt', 'authentic', 'body', 'displayName', 'eventName', 'feeCents', 'hasArt', 'hours', 'issuedAt', 'role', 'title']);
});

test('emissão e consulta ficam no evento autenticado e a migration só acrescenta', async () => {
  const service = await readFile(new URL('../src/certificate-role.service.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../prisma/migrations/20261009235000_certificate_roles/migration.sql', import.meta.url), 'utf8');
  const view = service.slice(service.indexOf('async publicView'), service.indexOf('async participantOffer'));
  assert.match(view, /return \{ \.\.\.publicRoleCertificateView/u);
  assert.doesNotMatch(view, /email|registrationData|protocol|identityDocument|personId|reservationId/u);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.doesNotMatch(service, /body\.organizationId|input\.organizationId/u);
  assert.match(service, /certificate\.role_issued/u);
  assert.match(service, /feeCents: certificateRoleFeeCents\(\)/u);
  assert.match(migration, /CREATE TABLE "EventRoleCertificate"/u);
  assert.match(migration, /EventRoleCertificate_subject_check/u);
  assert.match(migration, /DEFAULT false/u);
  assert.match(service, /NOT EXISTS/u);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/u);
});

