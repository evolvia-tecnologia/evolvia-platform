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
  assert.match(desk, /\(mode === 'labels' \|\| mode === 'settings'\) && organizer && capabilities\.has\('credential'\) && <section/u);
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
  assert.match(label, /ordered\.forEach\(\(item, index\)/u);
  assert.match(label, /styles\.codesRow/u);
  assert.match(label, /<CredentialQr code=\{label\.qr\} compact/u);
  assert.match(label, /: \[[\s\S]*label\.name/u);
  assert.match(service, /const template = categoryLabelTemplates\(config\?\.config\)\.find/u);
  assert.match(service, /if \(!template\) return \{ \.\.\.credential, emissao: \{ sequence, concluida: false \} \};/u,
    'categoria sem modelo explícito deve conservar a impressão histórica');
  assert.match(service, /const orderedFields = template\.fields;/u);
  assert.match(service, /categoryBadgeItems\(reservation\.registrationData, orderedFields, template\.styles\)/u);
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
  assert.match(editor, /À esquerda/u);
  assert.match(editor, /À direita/u);
  assert.match(editor, /Negrito/u);
  assert.match(editor, /Cor do texto/u);
  assert.match(editor, /JSON\.stringify\(\{ fields: chosen, styles \}\)/u);
  assert.match(label, /textAlign: item\.style\.align/u);
  assert.match(label, /item\.style\.bold \? 700 : 400/u);
});

test('QR alinha horizontalmente e o primeiro texto mantém destaque mesmo após QR', async () => {
  const label = await read('../components/credential-label.tsx');
  assert.match(label, /const firstTextIndex = ordered\?\.findIndex\(\(item\) => item\.kind === 'text'\) \?\? -1;/u);
  assert.match(label, /className=\{index === firstTextIndex \? styles\.orderedFirst : styles\.line\}/u);
  assert.match(label, /orderedQrAlign === 'left' \? 'start' : orderedQrAlign === 'right' \? 'end' : 'center'/u);
  assert.match(label, /justifySelf: qrJustify as/u);
  assert.doesNotMatch(label, /alignSelf: item\.style\.align/u);
  assert.equal([{ kind: 'qr' }, { kind: 'text' }].findIndex((item) => item.kind === 'text'), 1);
});

test('QR sem formatação explícita mostra centralizado no editor e preserva alinhamento da impressão legada', async () => {
  const [editor, label, css] = await Promise.all([
    read('../components/credential-category-templates.tsx'),
    read('../components/credential-label.tsx'),
    read('../components/credential-label.module.css'),
  ]);
  assert.ok(editor.includes("const DEFAULT_QR_STYLE: LabelFieldStyle = { ...DEFAULT_STYLE, align: 'center' };"));
  assert.ok(editor.includes("code === 'qr' || code === 'barcode' ? DEFAULT_QR_STYLE : DEFAULT_STYLE"));
  assert.match(editor, /style: Object\.prototype\.hasOwnProperty\.call\(visibleTemplate\.styles \?\? \{\}, code\)/u,
    'a prévia aplicada deve preservar o estilo persistido por categoria');
  assert.match(css, /\.codes \{[\s\S]*?justify-self: center;/u);
  assert.match(label, /styles\.codesRow/u);
  assert.match(label, /CredentialQr code=\{label\.qr\} compact/u);
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
  assert.match(css, /\.orderedQr\s*\{[^}]*justify-self:\s*center/u, 'QR legado deve centralizar no grid da etiqueta');
  assert.match(label, /orderedQrAlign === 'left' \? 'start'/u, 'alinhamento explícito deve sobrescrever o CSS');
  assert.match(label, /orderedQrAlign === 'right' \? 'end' : 'center'/u, 'direita e esquerda continuam funcionais');
  assert.match(label, /const qrAlignStyle = orderedQrAlign/u,
    'ausência de estilo preserva fallback centralizado na faixa');
});

test('campos customizados com nome constructor não herdam amostras ou estilos do protótipo', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  assert.match(editor, /Object\.prototype\.hasOwnProperty\.call\(format, code\) \? format\[code\] : undefined/u);
  assert.match(editor, /Object\.prototype\.hasOwnProperty\.call\(SAMPLES, code\) \? SAMPLES\[code\] : display\(code\)/u);
  assert.match(editor, /Object\.prototype\.hasOwnProperty\.call\(current, code\) \? current\[code\] : DEFAULT_STYLE/u);
  assert.match(editor, /chosen\.flatMap\(\(code\): \[string, LabelFieldStyle\]\[\] =>/u);
  assert.match(editor, /return style \? \[\[code, style\]\] : \[\]/u);
  assert.match(editor, /style: Object\.prototype\.hasOwnProperty\.call\(visibleTemplate\.styles \?\? \{\}, code\)/u,
    'a única prévia deve usar somente estilos próprios do modelo efetivo');
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
  // Payload de salvamento: apenas estilos próprios e definidos.
  const chosen = ['constructor', 'toString', 'preferred_name'];
  const savedStyles = Object.fromEntries(chosen.flatMap((code) => {
    const style = getOwn(explicit, code);
    return style ? [[code, style]] : [];
  }));
  assert.deepEqual(Object.keys(savedStyles), ['constructor']);
  assert.equal(savedStyles.constructor.align, 'center');
  assert.equal(getOwn(savedStyles, 'toString'), undefined);
  assert.equal(JSON.parse(JSON.stringify(savedStyles)).constructor.bold, true);
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
  assert.ok(editor.includes('inFlight.current = null;'));
  assert.ok(editor.includes('setBusy(false);'));
  assert.ok(editor.includes('if (inFlight.current === currentSession || !organizer || !categoryId || !isEditing) return;'));
  assert.match(editor, /disabled=\{busy \|\| !organizer \|\| !isEditing\} onClick=\{\(\) => void save\(\)\}/u,
    'evitar ativar uma etiqueta que o organizador não pré-visualizou');
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


test('desmontar editor de etiquetas invalida POST antigo antes de onSaved de outro evento', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  const effect = editor.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[eventId, categoryId, savedTemplate\]\);/u)?.[0];
  assert.ok(effect, 'efeito deve acompanhar evento, categoria e modelo efetivamente salvo');
  assert.match(effect, /return \(\) => \{\s*[\s\S]*?session\.current \+= 1;\s*inFlight\.current = null;\s*\};/u,
    'cleanup do unmount precisa invalidar sessão e lock de POST');
  assert.match(editor, /if \(currentSession !== session\.current \|\| targetId !== categoryId\) return;/u);
  const save = editor.slice(editor.indexOf('async function save()'), editor.indexOf('\n  return <section'));
  assert.ok(save.indexOf('if (currentSession !== session.current') < save.indexOf('onSaved('),
    'resposta tardia deve ser descartada antes de alterar contexto do organizador');

  // Modelo da corrida: a resposta da API chega depois da desmontagem por key={eventId}.
  let generation = 1;
  let appliedToNewEvent = 0;
  const oldRequestGeneration = generation;
  const pending = Promise.resolve().then(() => {
    if (oldRequestGeneration !== generation) return;
    appliedToNewEvent += 1;
  });
  generation += 1; // cleanup da sessão antiga
  await pending;
  assert.equal(appliedToNewEvent, 0, 'POST do evento antigo não deve atualizar o evento novo');
});


test('fonte e tamanho são configuráveis e compartilhados pela prévia e impressão', async () => {
  const [editor, label] = await Promise.all([
    read('../components/credential-category-templates.tsx'),
    read('../components/credential-label.tsx'),
  ]);
  assert.match(editor, /Tipo de fonte/u);
  assert.match(editor, /Tamanho da fonte/u);
  assert.match(editor, /fontFamily: event.target.value/u);
  assert.match(editor, /fontSizeMm: event.target.value \? Number\(event.target.value\) : undefined/u);
  assert.match(label, /SAFE_FONTS\[item.style.fontFamily\]/u);
  assert.match(label, /item.style.fontSizeMm \* scale/u);
  assert.match(label, /role="alert"/u);
  assert.match(editor, /JSON\.stringify\(\{ fields: chosen, styles \}\)/u);
});

test('salvamento rejeita resposta vazia sem atualizar a prévia e categoria ausente não quebra renderização', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  assert.match(editor, /if \(!result \|\| result\.categoryId !== targetId \|\| !Array\.isArray\(result\.fields\)/u,
    'API com resposta null/undefined deve ser rejeitada antes de acessar categoryId');
  assert.match(editor, /const selectedCategory = categories\.find\(\(item\) => item\.id === categoryId\)/u,
    'troca assíncrona de categorias deve resolver o objeto selecionado de forma segura');
  assert.match(editor, /selectedCategory\?\.name/u, 'prévia não deve quebrar com categoria ausente');
  assert.match(editor, /throw new Error\('O servidor não confirmou o modelo da categoria selecionada\.'\)/u);
  assert.match(editor, /onSaved\(\{ categoryId: targetId, fields: \[\.\.\.result\.fields\]/u);
});


test('salvar etiqueta não aceita confirmação parcial da API nem finge persistência de estilos', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  const save = editor.slice(editor.indexOf('async function save()'), editor.indexOf('\n  return <section'));
  assert.match(save, /result\.fields\.length !== chosen\.length/u,
    'o servidor deve confirmar a quantidade exata de campos');
  assert.match(save, /result\.fields\.some\(\(field, index\) => field !== chosen\[index\]\)/u,
    'o servidor deve confirmar a ordem exata dos campos');
  assert.match(save, /!confirmedStyles \|\| typeof confirmedStyles !== 'object'/u,
    'API legada que omite estilos não pode confirmar salvamento');
  assert.match(save, /Object\.keys\(confirmedStyles\)\.length !== Object\.keys\(styles\)\.length/u,
    'estilos omitidos ou extras não podem passar');
  for (const property of ['align', 'bold', 'color', 'fontFamily', 'fontSizeMm']) {
    assert.ok(save.includes('actual.' + property + ' !== expected.' + property),
      'propriedade ' + property + ' precisa ser confirmada pelo servidor');
  }
  assert.doesNotMatch(save, /result\.styles \?\? styles/u,
    'fallback local poderia fazer uma alteração não persistida parecer salva');
  assert.match(save, /onSaved\(\{ categoryId: targetId, fields: \[\.\.\.result\.fields\], styles: confirmedStyles \}\)/u);
});

test('controles de cada campo expõem grupos nomeados e checkbox Negrito contextualizado', async () => {
  const editor = await read('../components/credential-category-templates.tsx');
  assert.match(editor, /className=\{styles\.actions\} role="group" aria-label=\{`Alterar a ordem de \$\{display\(code\)\}`\}/u);
  assert.match(editor, /className=\{styles\.formatBar\} role="group" aria-label=\{`Formatação de \$\{display\(code\)\}`\}/u);
  assert.match(editor, /type="checkbox" aria-label=\{`Negrito de \$\{display\(code\)\}`\}/u);
});


test('campo de código da categoria oferece QR, barras e ambos sem segunda prévia', async () => {
  const [editor, policy, label] = await Promise.all([
    read('../components/credential-category-templates.tsx'),
    read('../../api/src/credential-category-template.policy.ts'),
    read('../components/credential-label.tsx'),
  ]);
  assert.match(editor, /<option value="QR">Somente QR Code<\/option>/u);
  assert.match(editor, /<option value="BARCODE">Somente código de barras<\/option>/u);
  assert.match(editor, /<option value="BOTH">Código de barras e QR Code<\/option>/u);
  assert.match(editor, /visibleTemplate\.fields\.includes\('barcode'\)/u);
  assert.match(policy, /code === 'barcode'/u);
  assert.match(label, /item\.kind === 'barcode'/u);
  assert.match(label, /missingOrderedBarcode/u);
  assert.equal((editor.match(/<CredentialLabel label=\{preview\} preview/g) ?? []).length, 1);
});


test('código de barras ocupa largura útil e não promete alinhamento horizontal inoperante', async () => {
  const [editor, renderer, css] = await Promise.all([
    read('../components/credential-category-templates.tsx'),
    read('../components/credential-label.tsx'),
    read('../components/credential-label.module.css'),
  ]);
  assert.match(editor, /code !== 'barcode' && <label>Alinhamento/u);
  assert.match(editor, /lado a lado com o QR|largura útil reservada|proporção do Code128/u);
  assert.match(renderer, /codesRow/u);
  assert.match(css, /\.codesRow\[data-codes="both"\]/u);
  assert.match(css, /--label-barcode-width/u);
});
