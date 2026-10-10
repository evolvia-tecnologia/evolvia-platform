import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import {
  batchIndexCsv,
  belongsToEvent,
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
});

test('o índice escapa fórmula e corta o título', () => {
  const csv = batchIndexCsv([{ fileName: 'trabalho-1-v1.pdf', title: '=CMD|calc' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=CMD\|calc"/u);
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
  assert.ok(zip.toString('latin1').includes('indice.csv'));
  assert.ok(zip.toString('latin1').includes('trabalho-1-v1.pdf'));

  const dir = mkdtempSync(join(tmpdir(), 'evolvia-zip-'));
  const file = join(dir, 'trabalhos.zip');
  try {
    writeFileSync(file, zip);
    const check = spawnSync('python3', ['-c', 'import zipfile,sys; p=zipfile.ZipFile(sys.argv[1]); assert p.namelist()==["indice.csv","trabalho-1-v1.pdf"]; assert p.read("trabalho-1-v1.pdf")==b"%PDF-1.4\\n"; assert "Resumo" in p.read("indice.csv").decode("utf-8")', file], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr || check.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
