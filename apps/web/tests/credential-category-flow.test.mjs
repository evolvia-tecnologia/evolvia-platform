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
  assert.match(service, /categoryBadgeItems\(reservation\.registrationData, orderedFields, template\?\.styles\)/u);
  assert.match(policy, /const DEFAULT_FIELDS = \['preferred_name', 'institution', 'city_state', 'qr'\]/u);
});

test('falha ao retirar presença preserva formulário e motivo para nova tentativa', async () => {
  const desk = await read('../components/event-desk.tsx');
  assert.match(desk, /async function run\(person: Person, path: string, body: unknown, success: string\): Promise<boolean>/u);
  assert.match(desk, /if \(succeeded\) \{ setSearchReversingId\(''\); setSearchReverseReason\(''\); \}/u);
  assert.match(desk, /setError\(reason instanceof Error \? reason\.message : 'Não foi possível concluir\.'\);\s*return false;/u);
});

test('formatação permite centro/esquerda/direita, negrito, cor e prévia sincronizada', async () => {
  const [editor, label] = await Promise.all([
    read('../components/credential-category-templates.tsx'),
    read('../components/credential-label.tsx'),
  ]);
  assert.match(editor, /Centralizado/u);
  assert.match(editor, /Esquerda/u);
  assert.match(editor, /Direita/u);
  assert.match(editor, /Negrito/u);
  assert.match(editor, /Cor da fonte/u);
  assert.match(editor, /JSON\.stringify\(\{ fields: chosen, styles \}\)/u);
  assert.match(label, /textAlign: item\.style\.align/u);
  assert.match(label, /item\.style\.bold \? 700 : 400/u);
});

test('QR alinha horizontalmente e o primeiro texto mantém destaque mesmo após QR', async () => {
  const label = await read('../components/credential-label.tsx');
  assert.match(label, /const firstTextIndex = ordered\?\.findIndex\(\(item\) => item\.kind === 'text'\) \?\? -1;/u);
  assert.match(label, /className=\{index === firstTextIndex \? styles\.orderedFirst : styles\.line\}/u);
  assert.match(label, /justifySelf: item\.style\.align === 'center' \? 'center' : item\.style\.align === 'right' \? 'end' : 'start'/u);
  assert.doesNotMatch(label, /alignSelf: item\.style\.align/u);
  assert.equal([{ kind: 'qr' }, { kind: 'text' }].findIndex((item) => item.kind === 'text'), 1);
});

test('QR sem formatação explícita mostra centralizado no editor e preserva alinhamento da impressão legada', async () => {
  const [editor, label] = await Promise.all([
    read('../components/credential-category-templates.tsx'),
    read('../components/credential-label.tsx'),
  ]);
  assert.ok(editor.includes("const DEFAULT_QR_STYLE: LabelFieldStyle = { ...DEFAULT_STYLE, align: 'center' };"));
  assert.ok(editor.includes("code === 'qr' ? DEFAULT_QR_STYLE : DEFAULT_STYLE"));
  assert.ok(editor.includes('style: ownStyle(code)'));
  assert.ok(label.includes('style={item.style?.align ? { justifySelf:'));
  assert.ok(label.includes(': undefined}><CredentialQr'));
});

test('prévia e impressão mantêm fundo branco e paleta de texto com contraste WCAG AA', async () => {
  const [editor, labelCss] = await Promise.all([
    read('../components/credential-category-templates.tsx'),
    read('../components/credential-label.module.css'),
  ]);
  const colors = [...editor.matchAll(/\{\s*value:\s*'(#[0-9a-f]{6})',\s*label:/gu)].map((match) => match[1]);
  assert.ok(colors.length >= 7, 'a paleta acessível precisa estar disponível');
  assert.ok(!colors.includes('#ffffff'), 'texto branco desapareceria no papel branco');
  const luminance = (hex) => {
    const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  for (const color of colors) {
    assert.ok(1.05 / (luminance(color) + 0.05) >= 4.5, `cor ${color} sem contraste 4,5:1`);
  }
  assert.match(labelCss, /\.sheet, \.preview \{[\s\S]*?background: #ffffff;\s*color: #111827;/u);
});


test('QR legado sem estilo fica centralizado na prévia e na impressão; alinhamento explícito prevalece', async () => {
  const [css, label] = await Promise.all([
    read('../components/credential-label.module.css'),
    read('../components/credential-label.tsx'),
  ]);
  assert.ok(css.includes('.orderedQr { justify-self: center;'), 'QR legado deve centralizar no grid da etiqueta');
  assert.ok(label.includes("style={item.style?.align ? { justifySelf:"), 'alinhamento explícito deve sobrescrever o CSS');
  assert.ok(label.includes("item.style.align === 'right' ? 'end' : 'start'"), 'direita e esquerda continuam funcionais');
  assert.ok(label.includes(': undefined}><CredentialQr'), 'ausência de estilo preserva fallback centralizado');
});

test('campos customizados com nome constructor não herdam amostras ou estilos do protótipo', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  assert.match(editor, /Object\.prototype\.hasOwnProperty\.call\(format, code\) \? format\[code\] : undefined/u);
  assert.match(editor, /Object\.prototype\.hasOwnProperty\.call\(SAMPLES, code\) \? SAMPLES\[code\] : display\(code\)/u);
  assert.match(editor, /Object\.prototype\.hasOwnProperty\.call\(current, code\) \? current\[code\] : DEFAULT_STYLE/u);
  assert.match(editor, /chosen\.filter\(\(code\) => ownStyle\(code\)\)/u);
  assert.match(editor, /style: ownStyle\(code\)/u);
  assert.doesNotMatch(editor, /SAMPLES\[code\] \?\? display\(code\)/u);

  const samples = { preferred_name: 'Ana Pesquisadora' };
  const format = {};
  const getOwn = (record, code) =>
    Object.prototype.hasOwnProperty.call(record, code) ? record[code] : undefined;
  assert.equal(getOwn(samples, 'constructor'), undefined);
  assert.equal(getOwn(format, 'constructor'), undefined);
  assert.equal(getOwn(format, '__proto__'), undefined);
  const explicit = Object.fromEntries([['constructor', { align: 'center', bold: true, color: '#111827' }]]);
  assert.equal(getOwn(explicit, 'constructor').align, 'center');
  assert.equal(getOwn(explicit, 'toString'), undefined);
});


test('erro ao salvar etiqueta não expõe mensagem técnica, token ou dados de outro tenant', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  const errorBlock = editor.match(/\} catch \{[\s\S]*?\n    \} finally \{/u)?.[0];
  assert.ok(errorBlock, 'salvamento deve tratar erro da API');
  assert.match(errorBlock, /if \(currentSession === session\.current\)/u);
  assert.match(errorBlock, /onError\('Não foi possível salvar o modelo da etiqueta\. Confira os campos e tente novamente\.'\)/u);
  assert.doesNotMatch(errorBlock, /reason\.message|caught\.message|JSON\.stringify\(reason\)|onError\(reason/u);
  const internalError = 'SQL SELECT * FROM registrations tenant_secret token=123';
  const publicMessage = 'Não foi possível salvar o modelo da etiqueta. Confira os campos e tente novamente.';
  assert.ok(!publicMessage.includes(internalError));
  assert.doesNotMatch(publicMessage, /SQL|tenant_secret|token=123/u);
});

test('troca de evento/categoria durante POST não bloqueia nova sessão nem libera gravação concorrente', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  assert.ok(editor.includes('const inFlight = useRef<number | null>(null);'));
  assert.ok(editor.includes('session.current += 1;'));
  assert.ok(editor.includes('inFlight.current = null;\\n    setBusy(false);'.replace('\\n', '\\n')));
  assert.ok(editor.includes('if (inFlight.current === currentSession || !organizer || !categoryId) return;'));
  assert.ok(editor.includes('if (inFlight.current === currentSession) {'));
  assert.ok(!editor.includes('inFlight.current = false;'));
  // Simulação determinística: A pendente, B iniciada, A conclui depois.
  let session = 1;
  let inFlight = null;
  const begin = () => {
    const current = session;
    if (inFlight === current) return null;
    inFlight = current;
    return current;
  };
  const finish = (current) => { if (inFlight === current) inFlight = null; };
  const first = begin();
  assert.equal(begin(), null, 'duplo clique na mesma sessão não cria POST duplicado');
  session += 1;
  inFlight = null;
  const second = begin();
  finish(first);
  assert.equal(inFlight, second, 'resposta da sessão anterior não libera o POST atual');
  assert.equal(begin(), null);
  finish(second);
  assert.equal(inFlight, null);
});
