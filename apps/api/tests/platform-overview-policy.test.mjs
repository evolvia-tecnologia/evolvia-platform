import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emAndamento,
  montarVisaoGeral,
  selecionarEventos,
} from '../src/platform-overview-policy.ts';

/**
 * Visão geral da Área Master (#665).
 *
 * A invariante que o fundador escreveu é o caso central: evento com duas áreas
 * aparece nas duas consultas e conta UMA ÚNICA VEZ no total geral. Ela vem com
 * a sua irmã, que é a que de fato pega o defeito: a SOMA dos baldes de área NÃO
 * é o total, e um painel que somasse mostraria mais eventos do que existem.
 */

const AGORA = new Date('2026-11-13T12:00:00.000Z').getTime();
const dia = (n) => new Date(`2026-11-${String(n).padStart(2, '0')}T12:00:00.000Z`);

const evento = (id, extra = {}) => ({
  id,
  organizationId: 'org-1',
  profileCode: 'OTHER',
  format: 'IN_PERSON',
  status: 'DRAFT',
  subjectAreas: [],
  createdAt: dia(10),
  startDate: null,
  endDate: null,
  ...extra,
});

const visao = (eventos, filtro = {}) => montarVisaoGeral(eventos, filtro, { agora: AGORA });
const chaves = (baldes) => baldes.map((b) => b.chave);
const porChave = (baldes, chave) => baldes.find((b) => b.chave === chave);

// ============================================ a invariante do fundador
test('evento com duas áreas aparece nas duas consultas e conta uma vez no total', () => {
  const eventos = [evento('a', { subjectAreas: ['saude', 'direito'] })];
  const v = visao(eventos);

  assert.equal(v.totais.criados, 1, 'o total geral conta eventos distintos');
  assert.deepEqual(chaves(v.porArea), ['direito', 'saude']);
  assert.deepEqual(porChave(v.porArea, 'saude').eventIds, ['a']);
  assert.deepEqual(porChave(v.porArea, 'direito').eventIds, ['a']);

  // E as duas CONSULTAS, que é a outra metade da frase.
  assert.deepEqual(selecionarEventos(eventos, { areas: ['saude'] }).map((e) => e.id), ['a']);
  assert.deepEqual(selecionarEventos(eventos, { areas: ['direito'] }).map((e) => e.id), ['a']);
});

test('a SOMA dos baldes de área não é o total, e isso é o desenho', () => {
  // É aqui que um painel ingênuo erra: somaria 4 e mostraria 4 eventos onde
  // existem 3. O erro é silencioso porque número grande não parece defeito.
  const v = visao([
    evento('a', { subjectAreas: ['saude', 'direito'] }),
    evento('b', { subjectAreas: ['saude'] }),
    evento('c', { subjectAreas: [] }),
  ]);
  const somaDosBaldes = v.porArea.reduce((total, b) => total + b.total, 0);
  assert.equal(somaDosBaldes, 3, 'saude=2, direito=1');
  assert.equal(v.totais.criados, 3, 'mas são três eventos');
  assert.notEqual(somaDosBaldes + v.semArea.total, v.totais.criados,
    'somar área com sem-área também não dá o total quando há evento multiárea');
});

test('área e sem-área cobrem todo evento do escopo, cada um ao menos uma vez', () => {
  const v = visao([
    evento('a', { subjectAreas: ['saude', 'direito'] }),
    evento('b', { subjectAreas: ['tecnologia'] }),
    evento('c', { subjectAreas: [] }),
  ]);
  const cobertos = new Set([...v.porArea.flatMap((b) => b.eventIds), ...v.semArea.eventIds]);
  assert.deepEqual([...cobertos].sort(), ['a', 'b', 'c'], 'ninguém fica fora do recorte de área');
  assert.deepEqual(v.semArea.eventIds, ['c']);
});

test('área repetida no mesmo evento não o conta duas vezes no próprio balde', () => {
  const v = visao([evento('a', { subjectAreas: ['saude', 'saude'] })]);
  assert.equal(porChave(v.porArea, 'saude').total, 1);
  assert.deepEqual(porChave(v.porArea, 'saude').eventIds, ['a']);
});

// ============================================ clicar no número abre o que o compõe
test('todo balde tem tantos ids quanto a contagem: o número É a lista', () => {
  const v = visao([
    evento('a', { subjectAreas: ['saude'], organizationId: 'org-1', status: 'PUBLISHED', startDate: dia(12), endDate: dia(14) }),
    evento('b', { subjectAreas: ['saude', 'direito'], organizationId: 'org-2', profileCode: 'SCIENTIFIC_EVENT', format: 'ONLINE' }),
    evento('c', { organizationId: null, profileCode: null, format: 'HYBRID', status: 'CANCELLED' }),
  ]);
  const todos = [...v.porArea, v.semArea, ...v.porOrganizacao, ...v.porPerfil, ...v.porFormato, ...v.porSituacao];
  for (const b of todos) {
    assert.equal(b.eventIds.length, b.total, `balde ${b.chave}: contagem e composição têm de ser a mesma coisa`);
    assert.equal(new Set(b.eventIds).size, b.total, `balde ${b.chave}: sem id repetido`);
  }
  for (const [nome, lista] of Object.entries(v.composicao)) {
    assert.equal(lista.length, v.totais[nome], `total ${nome} confere com a composição`);
  }
});

test('as dimensões de valor único são partição: a soma delas é o total', () => {
  const eventos = [
    evento('a', { organizationId: 'org-1', profileCode: 'OTHER', format: 'IN_PERSON', status: 'DRAFT' }),
    evento('b', { organizationId: 'org-2', profileCode: 'SCIENTIFIC_EVENT', format: 'ONLINE', status: 'PUBLISHED', startDate: dia(12) }),
    evento('c', { organizationId: null, profileCode: null, format: 'HYBRID', status: 'CANCELLED' }),
  ];
  const v = visao(eventos);
  for (const nome of ['porOrganizacao', 'porPerfil', 'porFormato', 'porSituacao']) {
    const soma = v[nome].reduce((total, b) => total + b.total, 0);
    assert.equal(soma, v.totais.criados, `${nome} tem de ser partição do total`);
  }
});

test('organização e perfil ausentes ganham balde nomeado, em vez de desaparecer', () => {
  const v = visao([evento('a', { organizationId: null, profileCode: null })]);
  assert.deepEqual(chaves(v.porOrganizacao), ['(sem organização)']);
  assert.deepEqual(chaves(v.porPerfil), ['(sem perfil)']);
  assert.equal(v.totais.criados, 1, 'e continuam contando no total');
});

// ============================================ criados, publicados, em andamento
test('publicados é subconjunto de criados, e em andamento de publicados', () => {
  const v = visao([
    evento('rascunho'),
    evento('publicado-futuro', { status: 'PUBLISHED', startDate: dia(20), endDate: dia(22) }),
    evento('publicado-agora', { status: 'PUBLISHED', startDate: dia(12), endDate: dia(14) }),
    evento('publicado-passado', { status: 'PUBLISHED', startDate: dia(1), endDate: dia(2) }),
    evento('encerrado', { status: 'FINISHED', startDate: dia(1), endDate: dia(2) }),
  ]);
  assert.equal(v.totais.criados, 5);
  assert.equal(v.totais.publicados, 3, 'FINISHED não é publicado hoje');
  assert.deepEqual(v.composicao.emAndamento, ['publicado-agora']);
  assert.equal(v.totais.emAndamento, 1);
});

test('em andamento é por instante, nas duas bordas', () => {
  const inicio = new Date(AGORA);
  const comeca = evento('x', { status: 'PUBLISHED', startDate: inicio, endDate: dia(20) });
  assert.equal(emAndamento(comeca, AGORA), true, 'o instante do início já é andamento');
  const termina = evento('y', { status: 'PUBLISHED', startDate: dia(1), endDate: inicio });
  assert.equal(emAndamento(termina, AGORA), true, 'o instante do término ainda é andamento');
  const antes = evento('z', { status: 'PUBLISHED', startDate: new Date(AGORA + 1), endDate: dia(20) });
  assert.equal(emAndamento(antes, AGORA), false);
  const depois = evento('w', { status: 'PUBLISHED', startDate: dia(1), endDate: new Date(AGORA - 1) });
  assert.equal(emAndamento(depois, AGORA), false);
});

test('publicado de um dia só, sem término, está em andamento no próprio dia', () => {
  const umDia = evento('u', { status: 'PUBLISHED', startDate: new Date(AGORA), endDate: null });
  assert.equal(emAndamento(umDia, AGORA), true);
  // E não fica em andamento para sempre: término ausente é "termina quando
  // começa", não "nunca termina".
  const antigo = evento('v', { status: 'PUBLISHED', startDate: dia(1), endDate: null });
  assert.equal(emAndamento(antigo, AGORA), false, 'evento antigo não pode ficar em andamento eterno');
});

test('publicado sem data não é zero: é desconhecido, e é contado à parte', () => {
  const v = visao([
    evento('sem-data', { status: 'PUBLISHED', startDate: null }),
    evento('com-data', { status: 'PUBLISHED', startDate: dia(12), endDate: dia(14) }),
  ]);
  assert.equal(emAndamento(evento('s', { status: 'PUBLISHED', startDate: null }), AGORA), null);
  assert.equal(v.totais.emAndamento, 1);
  assert.equal(v.totais.semDataParaAndamento, 1);
  assert.deepEqual(v.composicao.semDataParaAndamento, ['sem-data']);
  assert.equal(v.composicao.emAndamento.includes('sem-data'), false, 'não entra em andamento por omissão');
});

test('não publicado nunca está em andamento, nem com data dentro do intervalo', () => {
  for (const status of ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'SUSPENDED', 'FINISHED', 'CANCELLED']) {
    const e = evento('e', { status, startDate: dia(12), endDate: dia(14) });
    assert.equal(emAndamento(e, AGORA), false, status);
  }
});

test('evento suspenso sai de publicados e de em andamento', () => {
  const v = visao([evento('s', { status: 'SUSPENDED', startDate: dia(12), endDate: dia(14) })]);
  assert.equal(v.totais.criados, 1, 'continua existindo');
  assert.equal(v.totais.publicados, 0);
  assert.equal(v.totais.emAndamento, 0);
  assert.deepEqual(chaves(v.porSituacao), ['SUSPENDED']);
});

// ============================================ filtros
test('período filtra por createdAt por padrão, nas duas bordas inclusivas', () => {
  const eventos = [evento('a', { createdAt: dia(10) }), evento('b', { createdAt: dia(15) }), evento('c', { createdAt: dia(20) })];
  const v = visao(eventos, { de: dia(10), ate: dia(15) });
  assert.deepEqual(v.composicao.criados, ['a', 'b'], 'as bordas entram');
  assert.equal(v.contexto.campoDoPeriodo, 'createdAt');
  assert.deepEqual(visao(eventos, { de: dia(11), ate: dia(14) }).composicao.criados, []);
});

test('o período pode recortar por data de início, e isso muda o conjunto', () => {
  const eventos = [
    evento('criado-antes-comeca-depois', { createdAt: dia(1), startDate: dia(20) }),
    evento('criado-depois-comeca-antes', { createdAt: dia(20), startDate: dia(1) }),
  ];
  assert.deepEqual(
    visao(eventos, { de: dia(15), ate: dia(25), campoDoPeriodo: 'createdAt' }).composicao.criados,
    ['criado-depois-comeca-antes'],
  );
  const porInicio = visao(eventos, { de: dia(15), ate: dia(25), campoDoPeriodo: 'startDate' });
  assert.deepEqual(porInicio.composicao.criados, ['criado-antes-comeca-depois']);
  assert.equal(porInicio.contexto.campoDoPeriodo, 'startDate', 'o recorte usado volta no contexto');
});

test('evento sem a data do recorte não entra num período, em vez de entrar por omissão', () => {
  const eventos = [evento('sem-inicio', { startDate: null })];
  assert.deepEqual(visao(eventos, { de: dia(1), ate: dia(30), campoDoPeriodo: 'startDate' }).composicao.criados, []);
  assert.deepEqual(visao(eventos, { campoDoPeriodo: 'startDate' }).composicao.criados, ['sem-inicio'],
    'sem período informado, ele volta: a exclusão é do recorte, não do evento');
});

test('dentro de uma dimensão o filtro é OU; entre dimensões é E', () => {
  const eventos = [
    evento('a', { organizationId: 'org-1', format: 'ONLINE' }),
    evento('b', { organizationId: 'org-2', format: 'ONLINE' }),
    evento('c', { organizationId: 'org-1', format: 'IN_PERSON' }),
  ];
  assert.deepEqual(selecionarEventos(eventos, { organizationIds: ['org-1', 'org-2'] }).map((e) => e.id), ['a', 'b', 'c']);
  assert.deepEqual(selecionarEventos(eventos, { organizationIds: ['org-1'], formatos: ['ONLINE'] }).map((e) => e.id), ['a']);
  assert.deepEqual(selecionarEventos(eventos, { organizationIds: ['org-3'] }).map((e) => e.id), []);
});

test('filtro vazio não filtra nada, e lista vazia é o mesmo que ausente', () => {
  const eventos = [evento('a'), evento('b')];
  for (const filtro of [{}, { organizationIds: [] }, { areas: [] }, { formatos: [] }, { situacoes: [] }]) {
    assert.equal(selecionarEventos(eventos, filtro).length, 2, JSON.stringify(filtro));
  }
});

test('filtrar por área traz o evento multiárea, e os baldes seguem mostrando as duas áreas dele', () => {
  // Os baldes descrevem os eventos NO ESCOPO, não o filtro. O evento tem as
  // duas áreas, então as duas aparecem — esconder a segunda seria mentir sobre
  // o evento que está na lista.
  const v = visao([
    evento('a', { subjectAreas: ['saude', 'direito'] }),
    evento('b', { subjectAreas: ['tecnologia'] }),
  ], { areas: ['saude'] });
  assert.deepEqual(v.composicao.criados, ['a']);
  assert.deepEqual(chaves(v.porArea), ['direito', 'saude']);
  assert.equal(v.totais.criados, 1);
});

test('situação e perfil também filtram', () => {
  const eventos = [
    evento('a', { status: 'PUBLISHED', profileCode: 'SCIENTIFIC_EVENT', startDate: dia(12) }),
    evento('b', { status: 'DRAFT', profileCode: 'OTHER' }),
  ];
  assert.deepEqual(selecionarEventos(eventos, { situacoes: ['PUBLISHED'] }).map((e) => e.id), ['a']);
  assert.deepEqual(selecionarEventos(eventos, { profileCodes: ['OTHER'] }).map((e) => e.id), ['b']);
});

// ============================================ contexto: fonte, fuso, atualização
test('o contexto diz o fuso, o recorte, a janela e quando foi atualizado', () => {
  const v = montarVisaoGeral([evento('a')], { de: dia(1), ate: dia(30) }, {
    agora: AGORA, fuso: 'America/Recife', indisponiveis: ['inscritos por evento'],
  });
  assert.equal(v.contexto.fuso, 'America/Recife');
  assert.equal(v.contexto.atualizadoEm, new Date(AGORA).toISOString());
  assert.equal(v.contexto.de, dia(1).toISOString());
  assert.equal(v.contexto.ate, dia(30).toISOString());
  assert.deepEqual(v.contexto.indisponiveis, ['inscritos por evento'],
    'indicador não coletado é dito indisponível, não mostrado como zero');
});

test('o fuso é rótulo e não muda conta nenhuma', () => {
  const eventos = [evento('a', { status: 'PUBLISHED', startDate: dia(12), endDate: dia(14) })];
  const recife = montarVisaoGeral(eventos, {}, { agora: AGORA, fuso: 'America/Recife' });
  const tokyo = montarVisaoGeral(eventos, {}, { agora: AGORA, fuso: 'Asia/Tokyo' });
  assert.deepEqual(recife.totais, tokyo.totais, 'total não pode depender de quem está olhando');
  assert.deepEqual(recife.composicao, tokyo.composicao);
});

test('sem evento nenhum, tudo é zero e nada é indisponível por acidente', () => {
  const v = visao([]);
  assert.deepEqual(v.totais, { criados: 0, publicados: 0, emAndamento: 0, semDataParaAndamento: 0 });
  assert.deepEqual(v.porArea, []);
  assert.equal(v.semArea.total, 0);
  assert.deepEqual(v.contexto.indisponiveis, [], 'zero é zero; indisponível é outra coisa');
});

test('data inválida não estoura e não entra no período', () => {
  const eventos = [evento('a', { createdAt: 'não é data' })];
  assert.deepEqual(visao(eventos, { de: dia(1), ate: dia(30) }).composicao.criados, []);
  assert.equal(visao(eventos).totais.criados, 1, 'sem período, continua contando como criado');
});

test('os baldes saem em ordem estável, para o painel não dançar entre recargas', () => {
  const v = visao([
    evento('a', { subjectAreas: ['tecnologia'], organizationId: 'org-z' }),
    evento('b', { subjectAreas: ['direito'], organizationId: 'org-a' }),
    evento('c', { subjectAreas: ['saude'], organizationId: 'org-m' }),
  ]);
  assert.deepEqual(chaves(v.porArea), ['direito', 'saude', 'tecnologia']);
  assert.deepEqual(chaves(v.porOrganizacao), ['org-a', 'org-m', 'org-z']);
});
