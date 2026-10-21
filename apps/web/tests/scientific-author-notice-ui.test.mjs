import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8');
const extracted = source.match(/export function authorNoticeText[\s\S]*?\n\}/u)?.[0];
const compiled = ts.transpileModule(extracted, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const notice = await import(moduleUrl);

test('o aviso da versão usa português e não leva endereço', () => {
  const submitted = notice.authorNoticeText({ versionNumber: 1, kind: 'SUBMITTED', recordedAt: '2026-10-13T15:04:00.000Z' });
  const corrected = notice.authorNoticeText({ versionNumber: 2, kind: 'CORRECTED', recordedAt: '2026-10-13T16:04:00.000Z' });
  assert.match(submitted, /Aviso registrado em .+ recebemos a versão 1\./u);
  assert.match(corrected, /recebemos a correção, versão 2\./u);
  assert.equal(submitted.includes('@'), false);
  assert.equal(corrected.includes('@'), false);
  assert.match(source, /authorNoticeText\(notice\)/u);
  assert.match(source, /withAuthorNotice\(item\.notices, incomingNotice\)/u);
});

test('o horário do recibo é determinístico entre fusos sem esconder hidratação', () => {
  const script = `const {authorNoticeText}=await import(${JSON.stringify(moduleUrl)});process.stdout.write(authorNoticeText({versionNumber:1,kind:'SUBMITTED',recordedAt:'2026-10-13T15:04:00.000Z'}));`;
  const values = ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo'].map((TZ) => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  });
  assert.equal(new Set(values).size, 1);
  assert.match(values[0], /15:04:00 UTC/u);
  assert.equal(source.includes('suppressHydrationWarning'), false);
});

