import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../lib/event-communication-draft.ts', import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { communicationDraftId } = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
test('usa randomUUID nativo quando disponível',()=>{
  const value='12345678-1234-4123-8123-123456789abc';
  assert.equal(communicationDraftId({randomUUID:()=>value,getRandomValues:()=>{throw new Error('unexpected');}}),value);
});
test('sem randomUUID usa bytes criptográficos e preserva versão4/varianteRFC',()=>{
  for(const byte of [0, 255, 18]) {
    let calls=0;
    const id=communicationDraftId({getRandomValues:bytes=>{calls++;bytes.fill(byte);return bytes;}});
    assert.equal(calls,1);assert.match(id,uuid);
  }
});
test('sem fonte segura bloqueia criação em vez de usar Math.random',()=>{
  assert.throws(()=>communicationDraftId({}),/geração segura/);
  assert.throws(()=>communicationDraftId(null),/geração segura/);
});
