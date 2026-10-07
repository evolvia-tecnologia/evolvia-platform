import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  decisionLetterDocument,
  normalizeDecisionLetterBody,
} from '../dist/acceptance-letter.policy.js';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';
import { ScientificSubmissionsService } from '../dist/scientific-submissions.service.js';

const issuedAt = new Date('2026-10-06T18:00:00.000Z');
const source = readFileSync(new URL('../src/scientific-author.service.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/scientific-author.controller.ts', import.meta.url), 'utf8');

test('a carta confirma aceite ou recusa e não leva parecer nem avaliador', () => {
  const accepted = decisionLetterDocument({
    status: 'ACCEPTED', eventName: 'Congresso', title: 'Cuidado seguro', modality: 'Pôster', version: 2,
    authors: ['Ana Souza'], stationPublicCode: null, issuedAt, acceptanceBody: null, rejectionBody: 'NÃO USAR',
  });
  assert.equal(accepted.kind, 'acceptance');
  assert.equal(accepted.headline, 'Carta de aceite');
  assert.match(accepted.text, /Situação: Aceito/u);
  assert.match(accepted.text, /Ana Souza/u);
  assert.match(accepted.text, /Não é certificado/u);
  assert.match(accepted.text, /06\/10\/2026/u);
  assert.match(accepted.text, /não informado/u);
  assert.doesNotMatch(accepted.text, /NÃO USAR|parecerista|e-mail|@|\{/u);
  assert.deepEqual(Object.keys(accepted).sort(), ['headline', 'kind', 'text']);

  const changes = decisionLetterDocument({
    status: 'ACCEPTED_WITH_CHANGES', eventName: 'Congresso', title: 'Cuidado seguro', modality: 'Pôster', version: 2,
    authors: ['Ana Souza', 'Bruno Lima'], stationPublicCode: 17, issuedAt,
    acceptanceBody: 'Situação: {SITUACAO}. Autores: {NOME}. Código {CODIGO}.',
    rejectionBody: 'recusa',
  });
  assert.equal(changes.kind, 'acceptance');
  assert.equal(changes.headline, 'Carta de aceite com alterações');
  assert.match(changes.text, /Aceito com alterações/u);
  assert.match(changes.text, /Ana Souza, Bruno Lima/u);
  assert.match(changes.text, /Código 17/u);

  const rejected = decisionLetterDocument({
    status: 'REJECTED', eventName: 'Congresso {CPF}', title: 'Título <b>x</b>', modality: 'Pôster', version: 1,
    authors: ['Ana {EMAIL} Souza'], stationPublicCode: null, issuedAt,
    acceptanceBody: 'ACEITO-ONLY {NOME}',
    rejectionBody: 'Recusa {SITUACAO} de {NOME}. Evento {EVENTO}. Título {TITULO}.',
  });
  assert.equal(rejected.kind, 'rejection');
  assert.equal(rejected.headline, 'Carta de recusa');
  assert.match(rejected.text, /Recusa Recusado/u);
  assert.match(rejected.text, /Ana EMAIL Souza/u);
  assert.doesNotMatch(rejected.text, /ACEITO-ONLY|\{CPF\}|\{EMAIL\}|[<>]|@/u);
});

test('tag desconhecida e HTML não entram no texto da carta', () => {
  assert.throws(() => normalizeDecisionLetterBody('Olá {CPF}', 'carta de aceite'), /\{CPF\}/u);
  assert.throws(() => normalizeDecisionLetterBody('<p>oi</p>', 'carta de recusa'), /HTML/u);
  assert.equal(normalizeDecisionLetterBody('   ', 'carta de aceite'), null);
  assert.equal(normalizeDecisionLetterBody(null, 'carta de aceite'), null);
  assert.equal(normalizeDecisionLetterBody('**{NOME}** em {EVENTO}', 'carta de aceite'), '**{NOME}** em {EVENTO}');
});

test('a carta só sai do trabalho desta inscrição e a recusa também tem texto', async () => {
  const where = [];
  const configQueries = [];
  let config = null;
  const prisma = {
    scientificSubmission: { findFirst: async (query) => { where.push(query.where); return null; } },
    scientificSubmissionConfig: { findUnique: async (query) => { configQueries.push(query); return config; } },
  };
  const participants = { requireConfirmedScope: async () => ({ eventId: 'event-1', organizationId: 'org-1', reservationId: 'res-1' }) };
  const service = new ScientificAuthorService(prisma, participants, {});
  await assert.rejects(() => service.acceptanceLetter('congresso', 'Bearer token', 'csubmission01'), NotFoundException);
  assert.deepEqual(where[0], {
    id: 'csubmission01', eventId: 'event-1', organizationId: 'org-1', ownerReservationId: 'res-1',
  });
  assert.equal(configQueries.length, 0);

  prisma.scientificSubmission.findFirst = async () => ({
    title: 'Cuidado seguro', status: 'UNDER_REVIEW', currentVersion: 1, stationPublicCode: 9,
    modality: { name: 'Pôster' }, event: { name: 'Congresso' }, authors: [],
  });
  await assert.rejects(() => service.acceptanceLetter('congresso', 'Bearer token', 'csubmission01'), (error) => {
    assert.ok(error instanceof ConflictException);
    assert.match(error.message, /ainda não tem carta de decisão/u);
    return true;
  });
  assert.equal(configQueries.length, 0);

  prisma.scientificSubmission.findFirst = async () => ({
    title: 'Cuidado seguro', status: 'REJECTED', currentVersion: 1, stationPublicCode: null,
    modality: { name: 'Pôster' }, event: { name: 'Congresso' }, authors: [],
  });
  const rejection = await service.acceptanceLetter('congresso', 'Bearer token', 'csubmission01');
  assert.equal(rejection.kind, 'rejection');
  assert.match(rejection.text, /Recusado/u);
  assert.match(rejection.text, /Não é certificado/u);
  assert.deepEqual(configQueries[0].where, { eventId_organizationId: { eventId: 'event-1', organizationId: 'org-1' } });
  assert.deepEqual(configQueries[0].select, { acceptanceLetterBody: true, rejectionLetterBody: true });

  config = { acceptanceLetterBody: 'Olá **{NOME}** em {EVENTO}. Código {CODIGO}.', rejectionLetterBody: 'recusa {TITULO}' };
  prisma.scientificSubmission.findFirst = async () => ({
    title: 'Cuidado seguro', status: 'ACCEPTED', currentVersion: 2, stationPublicCode: 42,
    modality: { name: 'Pôster' }, event: { name: 'Congresso' },
    authors: [{ person: { name: 'Ana Souza' } }],
  });
  const letter = await service.acceptanceLetter('congresso', 'Bearer token', 'csubmission01');
  assert.equal(letter.kind, 'acceptance');
  assert.match(letter.text, /Ana Souza/u);
  assert.match(letter.text, /Congresso/u);
  assert.match(letter.text, /Código 42/u);
  assert.doesNotMatch(JSON.stringify(letter), /reviewer|score|email|organizationId|parecer/iu);
});

test('o autor não recebe o modelo e as duas rotas usam o mesmo método', () => {
  const getSource = source.slice(source.indexOf('async get('), source.indexOf('async submit('));
  const letterSource = source.slice(source.indexOf('async acceptanceLetter'), source.indexOf('async uploadEposter'));
  assert.doesNotMatch(getSource, /LetterBody/u);
  assert.match(letterSource, /stationPublicCode: true/u);
  assert.match(letterSource, /acceptanceLetterBody: true, rejectionLetterBody: true/u);
  assert.match(letterSource, /eventId: scope\.eventId, organizationId: scope\.organizationId/u);
  assert.doesNotMatch(letterSource, /submissionKeyHash|email|reviewer|score/u);
  assert.match(controller, /acceptance-letter/u);
  assert.match(controller, /decision-letter/u);
  assert.equal(controller.match(/authors\.acceptanceLetter/gu)?.length, 2);
});

test('o organizador grava só as cartas enviadas e recusa tag ou HTML', async () => {
  let written;
  const tx = {
    scientificSubmissionConfig: { upsert: async (input) => { written = input; return { id: 'cfg' }; } },
    auditLog: { create: async () => ({}) },
  };
  const prisma = {
    scientificSubmissionConfig: { findUnique: async () => null },
    $transaction: async (run) => run(tx),
  };
  const service = new ScientificSubmissionsService(prisma, {}, {});
  service.requireMutableScientificEvent = async () => ({ id: 'event-1', organizationId: 'org-1' });
  service.getManagement = async () => ({ ok: true });
  await assert.rejects(() => service.configure('user', 'event-1', { acceptanceLetterBody: 'Olá {CPF}' }), BadRequestException);
  await assert.rejects(() => service.configure('user', 'event-1', { rejectionLetterBody: '<b>não</b>' }), BadRequestException);
  await service.configure('user', 'event-1', { acceptanceLetterBody: 'Olá **{NOME}**', rejectionLetterBody: '   ' });
  assert.equal(written.update.acceptanceLetterBody, 'Olá **{NOME}**');
  assert.equal(written.update.rejectionLetterBody, null);
  assert.equal(written.create.acceptanceLetterBody, 'Olá **{NOME}**');
  await service.configure('user', 'event-1', { requireFile: true });
  assert.equal(written.update.acceptanceLetterBody, undefined);
  assert.equal(written.update.rejectionLetterBody, undefined);
});
