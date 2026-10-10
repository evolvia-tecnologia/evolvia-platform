import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32 } from 'node:zlib';
import {
  batchIndexCsv,
  belongsToEvent,
  continuationCursor,
  fileFitsBatch,
  storedZip,
  submissionBatchName,
} from '../src/scientific-file-batch.policy.ts';

const org = 'org123abc';
const event = 'evt456def';
const fileId = '11111111-1111-4111-8111-111111111111';
const key = `${org}/${event}/${fileId}.pdf`;

test('o nome do arquivo não revela autor e o caminho fica no evento', () => {
  assert.equal(submissionBatchName(1, 1), 'trabalho-1-v1.pdf');
  assert.equal(submissionBatchName(40, 99), 'trabalho-40-v99.pdf');
  assert.throws(() => submissionBatchName(0, 1), /Nome de arquivo inválido/u);
  assert.throws(() => submissionBatchName(41, 1), /Nome de arquivo inválido/u);
  assert.equal(belongsToEvent(key, org, event), true);
  assert.equal(belongsToEvent(key, 'outroorg', event), false);
  assert.equal(belongsToEvent(key, org, 'evt45'), false);
  assert.equal(belongsToEvent(`${org}/${event}/../segredo.pdf`, org, event), false);
  assert.equal(belongsToEvent(`${org}/evt456defextra/${fileId}.pdf`, org, 'evt456def'), false);
  assert.equal(belongsToEvent(`ORG123ABC/${event}/${fileId}.pdf`, 'ORG123ABC', event), false);
  assert.equal(belongsToEvent(`de305d54-75b4-431b-adb2-eb6b9e546014/${event}/${fileId}.pdf`, 'de305d54-75b4-431b-adb2-eb6b9e546014', event), false);
});

test('o recorte seguinte é opaco e o arquivo enorme não trava o lote', () => {
  assert.equal(continuationCursor(undefined), undefined);
  assert.equal(continuationCursor(''), undefined);
  assert.equal(continuationCursor('c'.repeat(25)), 'c'.repeat(25));
  assert.equal(continuationCursor('../etc/passwd'), '');
  assert.equal(continuationCursor('org/event/file'), '');
  assert.equal(fileFitsBatch(100, 0), 'take');
  assert.equal(fileFitsBatch(32 * 1024 * 1024 + 1, 0), 'skip');
  assert.equal(fileFitsBatch(20, 32 * 1024 * 1024 - 10), 'later');
});

test('o índice escapa fórmula e corta o título', () => {
  const csv = batchIndexCsv([{ fileName: 'trabalho-1-v1.pdf', title: '=CMD|calc' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=CMD\|calc"/u);
  assert.match(csv, /\r\n/u);
  assert.equal((csv.match(/(?<!\r)\n/gu) ?? []).length, 0);
  assert.doesNotMatch(csv, /email|autor/iu);
});

test('o zip guarda os bytes e um leitor abre o pacote', () => {
  const pdf = Buffer.from('%PDF-1.4\n');
  const index = Buffer.from(batchIndexCsv([{ fileName: 'trabalho-1-v1.pdf', title: 'Resumo' }]), 'utf8');
  const zip = storedZip([
    { name: 'indice.csv', bytes: index },
    { name: 'trabalho-1-v1.pdf', bytes: pdf },
  ]);
  const secondHeader = 30 + Buffer.byteLength('indice.csv') + index.length;
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);
  assert.equal(zip.readUInt16LE(8), 0);
  assert.equal(zip.readUInt32LE(14), crc32(index) >>> 0);
  assert.equal(zip.readUInt32LE(secondHeader + 14), crc32(pdf) >>> 0);
  const entries = readStoredEntries(zip);
  assert.deepEqual(entries.map((entry) => entry.name), ['indice.csv', 'trabalho-1-v1.pdf']);
  assert.equal(entries[1].data.toString('utf8'), '%PDF-1.4\n');
  assert.match(entries[0].data.toString('utf8'), /Resumo/u);
});

function readStoredEntries(zip) {
  const end = zip.lastIndexOf(Buffer.from('504b0506', 'hex'));
  assert.ok(end >= 0);
  const count = zip.readUInt16LE(end + 8);
  let cursor = zip.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50);
    assert.equal(zip.readUInt16LE(cursor + 10), 0);
    const crc = zip.readUInt32LE(cursor + 16);
    const size = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extra = zip.readUInt16LE(cursor + 30);
    const comment = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtra = zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(localOffset + 30 + localNameLength + localExtra, localOffset + 30 + localNameLength + localExtra + size);
    assert.equal(crc32(data) >>> 0, crc);
    entries.push({ name, data });
    cursor += 46 + nameLength + extra + comment;
  }
  return entries;
}
