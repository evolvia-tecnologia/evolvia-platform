import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPOS, CAMPOS_DO_PERIODO, FORMATOS, MAX_POR_DIMENSAO, PERFIS, SITUACOES,
  validarFiltroDaVisaoGeral,
} from '../src/platform-overview-request.ts';

const id = (n) => `evt${String(n).padStart(8, '0')}`;

test('filtro vazio vale e traz os padrões', () => {
  for (const vazio of [undefined, null, {}]) {
    const r = validarFiltroDaVisaoGeral(vazio);
    assert.equal(r.ok, true, String(vazio));
    assert.deepEqual(r.filtro, {
      de: null, ate: null, campoDoPeriodo: 'createdAt',
      organizationIds: [], profileCodes: [], areas: [], formatos: [], situacoes: [],
    });
  }
});

test('o período padrão conta pela criação, não pela data do evento', () => {
  // São contas diferentes: "criados em março" e "que acontecem em março" não
  // são o mesmo recorte, e o padrão tem de ser o que a pergunta mais comum usa.
  assert.equal(validarFiltroDaVisaoGeral({}).filtro.campoDoPeriodo, 'createdAt');
  assert.equal(validarFiltroDaVisaoGeral({ campoDoPeriodo: 'startDate' }).filtro.campoDoPeriodo, 'startDate');
  assert.deepEqual([...CAMPOS_DO_PERIODO], ['createdAt', 'startDate']);
});

test('campo de período desconhecido é recusado com explicação', () => {
  const r = validarFiltroDaVisaoGeral({ campoDoPeriodo: 'publicadoEm' });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /criação ou pela data de início/);
});

test('datas são normalizadas para ISO', () => {
  const r = validarFiltroDaVisaoGeral({ de: '2026-03-01', ate: '2026-03-31T23:59:59.000Z' });
  assert.equal(r.ok, true);
  assert.equal(r.filtro.de, '2026-03-01T00:00:00.000Z');
  assert.equal(r.filtro.ate, '2026-03-31T23:59:59.000Z');
});

test('data inválida é recusada em vez de virar NaN', () => {
  for (const ruim of ['ontem', '2026-13-45', 42, {}, []]) {
    const r = validarFiltroDaVisaoGeral({ de: ruim });
    assert.equal(r.ok, false, String(ruim));
  }
});

test('vazio e nulo nas datas significam sem período, não data inválida', () => {
  for (const vazio of ['', null, undefined]) {
    const r = validarFiltroDaVisaoGeral({ de: vazio, ate: vazio });
    assert.equal(r.ok, true, String(vazio));
    assert.equal(r.filtro.de, null);
  }
});

test('período invertido é recusado: é erro de quem montou, não recorte vazio', () => {
  const r = validarFiltroDaVisaoGeral({ de: '2026-03-31', ate: '2026-03-01' });
  assert.equal(r.ok, false);
  assert.match(r.erros.join(' '), /posterior/);
});

test('período de um único instante vale', () => {
  const r = validarFiltroDaVisaoGeral({ de: '2026-03-01T00:00:00.000Z', ate: '2026-03-01T00:00:00.000Z' });
  assert.equal(r.ok, true);
});

test('catálogos conhecidos passam e desconhecidos são recusados', () => {
  const r = validarFiltroDaVisaoGeral({
    formatos: ['IN_PERSON', 'ONLINE'], situacoes: ['PUBLISHED'], profileCodes: ['SCIENTIFIC_EVENT'],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.filtro.formatos, ['IN_PERSON', 'ONLINE']);

  for (const [campo, valor] of [['formatos', 'PRESENCIAL'], ['situacoes', 'ATIVO'], ['profileCodes', 'CIENTIFICO']]) {
    const ruim = validarFiltroDaVisaoGeral({ [campo]: [valor] });
    assert.equal(ruim.ok, false, `${campo}=${valor}`);
    assert.match(ruim.erros.join(' '), /valor inválido/);
  }
});

test('os catálogos espelham os enums do schema', () => {
  // Se um enum ganhar valor e esta lista não, o filtro novo é recusado com
  // mensagem clara em vez de aceito sem filtrar. Prender os valores aqui é o
  // que faz a divergência aparecer.
  assert.deepEqual([...FORMATOS], ['IN_PERSON', 'ONLINE', 'HYBRID']);
  assert.deepEqual([...SITUACOES], [
    'DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH',
    'PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED',
  ]);
  assert.deepEqual([...PERFIS], [
    'SCIENTIFIC_EVENT', 'CORPORATE_TRAINING', 'FAIR_EXHIBITION',
    'ENTERTAINMENT', 'SOCIAL_COMMUNITY', 'OTHER',
  ]);
});

test('valor de catálogo com espaços nas pontas é aceito e guardado limpo', () => {
  const r = validarFiltroDaVisaoGeral({ formatos: ['  ONLINE  '] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.filtro.formatos, ['ONLINE']);
});

test('repetido não duplica em nenhuma dimensão', () => {
  const r = validarFiltroDaVisaoGeral({
    formatos: ['ONLINE', 'ONLINE'], areas: ['saude', 'SAUDE'], organizationIds: [id(1), id(1)],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.filtro.formatos, ['ONLINE']);
  assert.deepEqual(r.filtro.areas, ['saude']);
  assert.deepEqual(r.filtro.organizationIds, [id(1)]);
});

test('área é texto curto normalizado, e id é id', () => {
  const r = validarFiltroDaVisaoGeral({ areas: ['Saude', 'educacao'], organizationIds: [id(2)] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.filtro.areas, ['saude', 'educacao']);

  // Área com uma letra, ou com caractere que não existe em slug, é recusada.
  for (const ruim of ['a', 'área!', 'com espaço', 'x'.repeat(41), 42]) {
    assert.equal(validarFiltroDaVisaoGeral({ areas: [ruim] }).ok, false, String(ruim));
  }
});

test('id curto ou com caractere estranho é recusado, não levado adiante', () => {
  for (const ruim of ['curto', 'com+mais', 'com espaço', 'x'.repeat(65), 7, null]) {
    assert.equal(validarFiltroDaVisaoGeral({ organizationIds: [ruim] }).ok, false, String(ruim));
  }
  assert.equal(validarFiltroDaVisaoGeral({ organizationIds: ['x'.repeat(64)] }).ok, true, 'no limite passa');
  assert.equal(validarFiltroDaVisaoGeral({ organizationIds: ['x'.repeat(8)] }).ok, true, 'no mínimo passa');
});

test('dimensão que não é lista é recusada', () => {
  for (const campo of ['organizationIds', 'areas', 'formatos', 'situacoes', 'profileCodes']) {
    const r = validarFiltroDaVisaoGeral({ [campo]: 'ONLINE' });
    assert.equal(r.ok, false, campo);
    assert.match(r.erros.join(' '), /precisa ser uma lista/);
  }
});

test('lista vazia é o mesmo que não filtrar', () => {
  const r = validarFiltroDaVisaoGeral({ formatos: [], areas: [], organizationIds: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.filtro.formatos, []);
});

test('lista acima do teto é recusada: é defeito de quem montou', () => {
  const muitos = Array.from({ length: MAX_POR_DIMENSAO + 1 }, (_, i) => id(i));
  const r = validarFiltroDaVisaoGeral({ organizationIds: muitos });
  assert.equal(r.ok, false);
  assert.match(r.erros.join(' '), new RegExp(String(MAX_POR_DIMENSAO)));

  const noTeto = Array.from({ length: MAX_POR_DIMENSAO }, (_, i) => id(i));
  assert.equal(validarFiltroDaVisaoGeral({ organizationIds: noTeto }).ok, true, 'no teto exato passa');
  assert.equal(MAX_POR_DIMENSAO, 200);
});

test('corpo que não é objeto é recusado de uma vez', () => {
  for (const ruim of ['texto', 42, [], [1, 2]]) {
    const r = validarFiltroDaVisaoGeral(ruim);
    assert.equal(r.ok, false, String(ruim));
    assert.deepEqual(r.erros, ['Filtro inválido.']);
  }
});

test('todos os problemas vêm juntos, não um por tentativa', () => {
  const r = validarFiltroDaVisaoGeral({
    de: 'ontem', campoDoPeriodo: 'inventado', formatos: ['PRESENCIAL'],
    organizationIds: ['curto'], areas: ['a'],
  });
  assert.equal(r.ok, false);
  assert.ok(r.erros.length >= 5, `veio só ${r.erros.length}: ${r.erros.join(' | ')}`);
  assert.equal(new Set(r.erros).size, r.erros.length, 'sem mensagem repetida');
});

// ------------------------------------------- o CAMPO de cada recusa
//
// Antes, a recusa saía só com a frase, e o `field` do contrato ia vazio: num
// recorte com cinco problemas a pessoa tinha de deduzir a qual dimensão cada
// frase se referia. O `field` é consumido por código que não aparece aqui, e
// errar um nome não quebraria nada visivelmente — só produziria destaque que
// cai no vazio.

test('cada recusa nomeia a dimensão que o formulário deve destacar', () => {
  const casos = [
    [{ de: 'ontem' }, CAMPOS.de],
    [{ de: 42 }, CAMPOS.de],
    [{ ate: 'ontem' }, CAMPOS.ate],
    [{ campoDoPeriodo: 'publicadoEm' }, CAMPOS.campoDoPeriodo],
    [{ campoDoPeriodo: 7 }, CAMPOS.campoDoPeriodo],
    [{ organizationIds: 'nao-e-lista' }, CAMPOS.organizationIds],
    [{ organizationIds: ['curto'] }, CAMPOS.organizationIds],
    [{ organizationIds: Array.from({ length: MAX_POR_DIMENSAO + 1 }, (_, i) => id(i)) }, CAMPOS.organizationIds],
    [{ areas: ['a'] }, CAMPOS.areas],
    [{ areas: 'saude' }, CAMPOS.areas],
    [{ profileCodes: ['CIENTIFICO'] }, CAMPOS.profileCodes],
    [{ formatos: ['PRESENCIAL'] }, CAMPOS.formatos],
    [{ situacoes: ['ATIVO'] }, CAMPOS.situacoes],
  ];
  for (const [corpo, esperado] of casos) {
    const r = validarFiltroDaVisaoGeral(corpo);
    assert.equal(r.ok, false, JSON.stringify(corpo));
    assert.equal(r.problemas.length, 1, `${JSON.stringify(corpo)} produziu ${r.problemas.length}`);
    assert.equal(r.problemas[0].campo, esperado, JSON.stringify(corpo));
  }
});

test('período invertido é atribuído à data inicial, não às duas', () => {
  // Destacar os dois campos faria a pessoa procurar o erro em dois lugares
  // quando só um precisa mudar. A mensagem acusa a inicial; o destaque segue a
  // mensagem.
  const r = validarFiltroDaVisaoGeral({ de: '2026-03-31', ate: '2026-03-01' });
  assert.equal(r.problemas.length, 1);
  assert.equal(r.problemas[0].campo, 'de');
});

test('filtro inteiro inválido não finge pertencer a uma dimensão', () => {
  for (const ruim of ['texto', 42, [], [1, 2]]) {
    const r = validarFiltroDaVisaoGeral(ruim);
    assert.equal(r.problemas.length, 1, String(ruim));
    assert.equal(r.problemas[0].campo, '', 'inventar dimensão aqui daria destaque errado');
    assert.equal(r.problemas[0].mensagem, 'Filtro inválido.');
  }
});

test('problemas acumulados preservam a dimensão de cada um, na ordem de leitura', () => {
  const r = validarFiltroDaVisaoGeral({
    de: 'ontem', campoDoPeriodo: 'inventado', organizationIds: ['curto'],
    areas: ['a'], profileCodes: ['X'], formatos: ['Y'], situacoes: ['Z'],
  });
  assert.deepEqual(r.problemas.map((p) => p.campo), [
    CAMPOS.de, CAMPOS.campoDoPeriodo, CAMPOS.organizationIds,
    CAMPOS.areas, CAMPOS.profileCodes, CAMPOS.formatos, CAMPOS.situacoes,
  ]);
});

test('erros é derivado de problemas, nunca mantido em paralelo', () => {
  const r = validarFiltroDaVisaoGeral({ de: 'ontem', formatos: ['X'] });
  assert.deepEqual(r.erros, r.problemas.map((p) => p.mensagem));
  assert.equal(r.erros.length, r.problemas.length);
});

test('toda dimensão nomeada existe no corpo que o DTO aceita', () => {
  // Um `field` que não corresponde a nada no corpo é destaque que cai no vazio.
  const doDto = new Set([
    'de', 'ate', 'campoDoPeriodo', 'organizationIds', 'profileCodes', 'areas', 'formatos', 'situacoes',
  ]);
  for (const [chave, caminho] of Object.entries(CAMPOS)) {
    if (caminho === '') continue;
    assert.ok(doDto.has(caminho.split('.')[0]), `CAMPOS.${chave} aponta para "${caminho}", fora do DTO`);
  }
  // E o inverso: toda dimensão do DTO tem nome aqui. Sem isto, acrescentar
  // dimensão nova e esquecer o campo passaria sem ninguém ver.
  const nomeados = new Set(Object.values(CAMPOS).filter((c) => c !== ''));
  for (const campo of doDto) {
    assert.ok(nomeados.has(campo), `a dimensão "${campo}" do DTO não tem entrada em CAMPOS`);
  }
});
