import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the real modules, resolving their bundler-style import for Node.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const timeUrl = moduleUrl(readFileSync(new URL('../lib/event-time-zone.ts', import.meta.url), 'utf8'));
const editSource = readFileSync(new URL('../lib/scientific-program-edit.ts', import.meta.url), 'utf8');
const { programActivityEditForm, programActivityEditPatch } = await import(moduleUrl(editSource.replace("'./event-time-zone'", JSON.stringify(timeUrl))));
const activity = { id: 'activity-a', title: 'Mesa', activityType: 'Debate', startAt: '2026-10-10T12:10:15.123Z', endAt: '2026-10-10T13:10:15.456Z', spaceId: 'room-a' };

for (const zone of ['UTC', 'America/Sao_Paulo', 'Asia/Kolkata', 'Pacific/Auckland']) {
  test(`editar em ${zone} preserva instantes, segundos e campos ocultos`, () => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      const form = programActivityEditForm(activity);
      assert.deepEqual(programActivityEditPatch(activity, form), {});
      assert.deepEqual(programActivityEditPatch(activity, { ...form, title: 'Novo título' }), { title: 'Novo título' });
      const changedStart = new Date(new Date(activity.startAt).getTime() + 60_000).toISOString();
      const changed = programActivityEditForm({ ...activity, startAt: changedStart });
      assert.deepEqual(programActivityEditPatch(activity, changed), { startAt: changedStart.replace('.123Z', '.000Z') });
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
}

test('envia apenas a troca explícita de espaço, inclusive quando o anterior está indefinido', () => {
  assert.deepEqual(programActivityEditPatch(activity, { ...programActivityEditForm(activity), spaceId: 'room-b' }), { spaceId: 'room-b' });
  const noSpace = { ...activity, spaceId: null };
  assert.deepEqual(programActivityEditPatch(noSpace, { ...programActivityEditForm(noSpace), spaceId: 'room-b' }), { spaceId: 'room-b' });
  assert.throws(() => programActivityEditPatch(activity, { ...programActivityEditForm(activity), spaceId: '' }), /Escolha um espaço/);
});

test('recusa intervalo inválido e título vazio sem mutar a atividade', () => {
  const snapshot = { ...activity };
  const form = programActivityEditForm(activity);
  assert.throws(() => programActivityEditPatch(activity, { ...form, startAt: '' }), /datas e horários válidos/);
  assert.throws(() => programActivityEditPatch(activity, { ...form, startAt: '2026-02-31T10:00:00' }), /datas e horários válidos/);
  assert.throws(() => programActivityEditPatch(activity, { ...form, endAt: form.startAt }), /posterior ao início/);
  assert.throws(() => programActivityEditPatch(activity, { ...form, title: '  ' }), /título e o tipo/);
  assert.deepEqual(activity, snapshot);
});

test('preserva horário ambíguo original e recusa horário inexistente na mudança de verão', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const repeated = { ...activity, startAt: '2026-11-01T06:30:00.123Z', endAt: '2026-11-01T07:30:00.456Z' };
    assert.deepEqual(programActivityEditPatch(repeated, programActivityEditForm(repeated)), {});
    assert.throws(() => programActivityEditPatch(activity, { ...programActivityEditForm(activity), startAt: '2026-03-08T02:30:00' }), /datas e horários válidos/);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
