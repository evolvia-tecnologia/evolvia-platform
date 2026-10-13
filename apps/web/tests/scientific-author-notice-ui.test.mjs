import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

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
