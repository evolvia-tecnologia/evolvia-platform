import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { acceptanceLetterDocument } from '../dist/acceptance-letter.policy.js';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const issuedAt = new Date('2026-10-06T18:00:00.000Z');

test('a carta confirma o aceite e não leva parecer nem avaliador', () => {
  const accepted = acceptanceLetterDocument({
    eventName: 'Congresso', title: 'Cuidado seguro', modality: 'Pôster', version: 2,
    status: 'ACCEPTED', authors: ['Ana Souza'], issuedAt,
  });
  assert.equal(accepted.headline, 'Carta de aceite');
  assert.match(accepted.text, /Situação: Aceito/u);
  assert.match(accepted.text, /Ana Souza/u);
  assert.match(accepted.text, /Não é certificado/u);
  assert.doesNotMatch(accepted.text, /parecerista|nota |e-mail|@/iu);

  const changes = acceptanceLetterDocument({
    eventName: 'Congresso', title: 'Cuidado seguro', modality: 'Pôster', version: 2,
    status: 'ACCEPTED_WITH_CHANGES', authors: ['Ana Souza', 'Bruno Lima'], issuedAt,
  });
  assert.match(changes.text, /Aceito com alterações/u);
  assert.match(changes.text, /Ana Souza, Bruno Lima/u);
});

test('a carta só sai do trabalho aceito desta inscrição', async () => {
  const where = [];
  const prisma = {
    scientificSubmission: { findFirst: async (query) => { where.push(query.where); return null; } },
  };
  const participants = { requireConfirmedScope: async () => ({ eventId: 'event-1', organizationId: 'org-1', reservationId: 'res-1' }) };
  const service = new ScientificAuthorService(prisma, participants, {});
  await assert.rejects(() => service.acceptanceLetter('congresso', 'Bearer token', 'csubmission01'), NotFoundException);
  assert.deepEqual(where[0], {
    id: 'csubmission01', eventId: 'event-1', organizationId: 'org-1', ownerReservationId: 'res-1',
  });

  prisma.scientificSubmission.findFirst = async () => ({
    title: 'Cuidado seguro', status: 'REJECTED', currentVersion: 1,
    modality: { name: 'Pôster' }, event: { name: 'Congresso' }, authors: [],
  });
  await assert.rejects(() => service.acceptanceLetter('congresso', 'Bearer token', 'csubmission01'), (error) => {
    assert.ok(error instanceof ConflictException);
    assert.match(error.message, /ainda não tem carta de aceite/u);
    return true;
  });

  prisma.scientificSubmission.findFirst = async () => ({
    title: 'Cuidado seguro', status: 'ACCEPTED', currentVersion: 2,
    modality: { name: 'Pôster' }, event: { name: 'Congresso' },
    authors: [{ person: { name: 'Ana Souza' } }],
  });
  const letter = await service.acceptanceLetter('congresso', 'Bearer token', 'csubmission01');
  assert.match(letter.text, /Cuidado seguro/u);
  assert.match(letter.text, /Ana Souza/u);
  assert.doesNotMatch(JSON.stringify(letter), /reviewer|score|email/iu);
});
