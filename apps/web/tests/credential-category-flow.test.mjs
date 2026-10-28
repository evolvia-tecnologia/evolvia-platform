import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Etiquetas abre configurador por categoria, sem exigir inscrições confirmadas', async () => {
  const [desk, editor, operations] = await Promise.all([
    read('../components/event-desk.tsx'),
    read('../components/credential-category-templates.tsx'),
    read('../components/credential-operations.tsx'),
  ]);
  assert.match(desk, /mode === 'labels' && organizer && capabilities\.has\('credential'\) && <CredentialCategoryTemplates/u);
  assert.match(desk, /<CredentialCategoryTemplates/u);
  assert.match(editor, /categories\.map\(\(category\) => <option/u);
  assert.match(editor, /defaultCategoryLabelFields|const DEFAULT = \['preferred_name', 'institution', 'city_state', 'qr'\]/u);
  assert.match(editor, /Salvar modelo da categoria/u);
  assert.doesNotMatch(operations, /mode === 'labels'|Lista de etiquetas/u);
});

test('organizador configura a ordem, adiciona, remove e restaura campos da ficha', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  assert.match(editor, /Adicionar campo/u);
  assert.match(editor, /Remover/u);
  assert.match(editor, /Subir \$\{display\(code\)\}/u);
  assert.match(editor, /Descer \$\{display\(code\)\}/u);
  assert.match(editor, /Restaurar padrão/u);
  assert.match(editor, /labels\/categories\/\$\{encodeURIComponent\(targetId\)\}/u);
  assert.match(editor, /const currentSession = session\.current/u);
});

test('busca e lista para impressão exibem nome, inscrição, ações e confirmação auditada', async () => {
  const [desk, operations] = await Promise.all([
    read('../components/event-desk.tsx'),
    read('../components/credential-operations.tsx'),
  ]);
  for (const source of [desk, operations]) {
    assert.match(source, /Nome do participante/u);
    assert.match(source, /Código da inscrição/u);
    assert.match(source, /Imprimir etiqueta/u);
    assert.match(source, /Marcar presença/u);
    assert.match(source, /Retirar presença/u);
    assert.match(source, /Confirmar retirada/u);
    assert.match(source, /check-in\/reverse/u);
    assert.match(source, /reason:/u);
    assert.match(source, /<table/u);
  }
  assert.match(operations, /'check-in\/reverse' : 'check-in'/u);
  assert.doesNotMatch(operations, /window\.print\(/u);
});

test('a credencial respeita ordem do modelo e mantém implementação antiga para legado', async () => {
  const [label, service, policy] = await Promise.all([
    read('../components/credential-label.tsx'),
    read('../../api/src/event-desk.service.ts'),
    read('../../api/src/credential-category-template.policy.ts'),
  ]);
  assert.match(label, /orderedContent\?: Array/u);
  assert.match(label, /ordered\.map\(\(item, index\)/u);
  assert.match(label, /<CredentialQr code=\{label\.qr\} compact/u);
  assert.match(label, /: \[[\s\S]*label\.name/u);
  assert.match(service, /labelTemplateForCategory\(config\?\.config, reservation\.category\.id\)/u);
  assert.match(service, /categoryBadgeItems\(reservation\.registrationData, orderedFields\)/u);
  assert.match(policy, /const DEFAULT_FIELDS = \['preferred_name', 'institution', 'city_state', 'qr'\]/u);
});

test('falha ao retirar presença preserva formulário e motivo para nova tentativa', async () => {
  const desk = await read('../components/event-desk.tsx');
  assert.match(desk, /async function run\(person: Person, path: string, body: unknown, success: string\): Promise<boolean>/u);
  assert.match(desk, /if \(succeeded\) \{ setSearchReversingId\(''\); setSearchReverseReason\(''\); \}/u);
  assert.match(desk, /setError\(reason instanceof Error \? reason\.message : 'Não foi possível concluir\.'\);\s*return false;/u);
});
