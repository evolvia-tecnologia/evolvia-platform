import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_MAXIMO, LIMITE_PADRAO, MAX_ACOES_NO_FILTRO, RESULTADOS,
  dentroDoEscopo, montarRelatorio, restricaoDoEscopo, validarFiltroDoRelatorio,
} from '../src/platform-audit-report.ts';

const T0 = Date.parse('2026-11-14T12:00:00.000Z');
const id = (n) => `usr${String(n).padStart(8, '0')}`;
const EV_A = 'evtaaaaaaaa';
const EV_B = 'evtbbbbbbbb';
const ORG_A = 'orgaaaaaaaa';

const linha = (over = {}) => ({
  actorUserId: id(1),
  action: 'consultar',
  scopeKind: 'EVENTO',
  organizationId: ORG_A,
  eventId: EV_A,
  targetUserId: '',
  reason: 'Conferência de rotina solicitada pelo organizador.',
  result: 'ALLOWED',
  changes: null,
  correlationId: 'corr-1',
  occurredAt: new Date(T0),
  ...over,
});

const filtroPadrao = () => validarFiltroDoRelatorio({}).filtro;

// ------------------------------------------------------------------- escopo

test('a restrição do banco vem do escopo, e o escopo da plataforma não restringe', () => {
  assert.deepEqual(restricaoDoEscopo({ tipo: 'PLATAFORMA' }), {});
  assert.deepEqual(restricaoDoEscopo({ tipo: 'EVENTO', eventId: EV_A }), { eventId: EV_A });
  assert.deepEqual(restricaoDoEscopo({ tipo: 'ORGANIZACAO', organizationId: ORG_A }), { organizationId: ORG_A });
});

test('linha de OUTRO evento não entra, mesmo que a consulta a tenha trazido', () => {
  // Este é o ponto do arquivo. O `where` do banco é otimização; a fronteira é
  // esta. Se alguém esquecer a cláusula na consulta, a linha de fora continua
  // fora do relatório.
  const linhas = [linha({ eventId: EV_A }), linha({ eventId: EV_B, correlationId: 'corr-2' })];
  const r = montarRelatorio(linhas, { tipo: 'EVENTO', eventId: EV_A }, filtroPadrao());
  assert.equal(r.mostrados, 1);
  assert.equal(r.itens[0].eventId, EV_A);
  assert.ok(!r.itens.some((i) => i.eventId === EV_B), 'nenhuma linha do outro evento');
});

test('linha de outra organização não entra no relatório da organização', () => {
  const linhas = [
    linha({ scopeKind: 'ORGANIZACAO', organizationId: ORG_A, eventId: '' }),
    linha({ scopeKind: 'ORGANIZACAO', organizationId: 'orgzzzzzzzz', eventId: '', correlationId: 'corr-2' }),
  ];
  const r = montarRelatorio(linhas, { tipo: 'ORGANIZACAO', organizationId: ORG_A }, filtroPadrao());
  assert.equal(r.mostrados, 1);
  assert.equal(r.itens[0].organizationId, ORG_A);
});

test('ação de alcance global NÃO aparece no relatório de um evento', () => {
  // Limite declarado: ela foi gravada sem eventId, e mostrá-la a quem audita um
  // evento contaria o que acontece no resto da plataforma.
  const global = linha({ scopeKind: 'GLOBAL', organizationId: '', eventId: '', action: 'conceder' });
  const r = montarRelatorio([global], { tipo: 'EVENTO', eventId: EV_A }, filtroPadrao());
  assert.equal(r.mostrados, 0);

  // E na plataforma ela aparece.
  const naPlataforma = montarRelatorio([global], { tipo: 'PLATAFORMA' }, filtroPadrao());
  assert.equal(naPlataforma.mostrados, 1);
});

test('escopo de evento com coluna vazia não casa com tudo', () => {
  // Se `eventId` vazio casasse com escopo de evento, a sentinela do schema
  // viraria curinga e todo relatório de evento veria as ações globais.
  assert.equal(dentroDoEscopo(linha({ eventId: '' }), { tipo: 'EVENTO', eventId: '' }), false);
  assert.equal(dentroDoEscopo(linha({ organizationId: '' }), { tipo: 'ORGANIZACAO', organizationId: '' }), false);
});

test('o corpo não tem como ampliar o escopo', () => {
  // Não existe campo de escopo no filtro. Mandar um é ignorado — e o relatório
  // continua restrito ao que a rota autorizou.
  const comEscopoNoCorpo = validarFiltroDoRelatorio({ eventId: EV_B, escopo: { tipo: 'PLATAFORMA' }, organizationId: 'orgzzzzzzzz' });
  assert.equal(comEscopoNoCorpo.ok, true, 'campo desconhecido não derruba o filtro');
  assert.ok(!('eventId' in comEscopoNoCorpo.filtro), 'e não entra no filtro');
  assert.ok(!('escopo' in comEscopoNoCorpo.filtro));

  const linhas = [linha({ eventId: EV_A }), linha({ eventId: EV_B })];
  const r = montarRelatorio(linhas, { tipo: 'EVENTO', eventId: EV_A }, comEscopoNoCorpo.filtro);
  assert.equal(r.mostrados, 1);
  assert.equal(r.itens[0].eventId, EV_A);
});

// -------------------------------------------------------------- o filtro

test('filtro vazio vale e traz os padrões', () => {
  for (const vazio of [undefined, null, {}]) {
    const r = validarFiltroDoRelatorio(vazio);
    assert.equal(r.ok, true, String(vazio));
    assert.deepEqual(r.filtro, {
      de: null, ate: null, acoes: [], resultados: [],
      actorUserId: null, targetUserId: null, limite: LIMITE_PADRAO,
    });
  }
});

test('por padrão o relatório NÃO esconde recusa nem falha', () => {
  // Trilha que só mostra o que deu certo não serve para auditar.
  const linhas = RESULTADOS.map((result, i) => linha({ result, correlationId: `c${i}` }));
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, filtroPadrao());
  assert.equal(r.mostrados, 3);
  assert.deepEqual(r.porResultado, { ALLOWED: 1, DENIED: 1, FAILED: 1 });
});

test('filtrar por resultado estreita, e resultado desconhecido é recusado', () => {
  const linhas = RESULTADOS.map((result, i) => linha({ result, correlationId: `c${i}` }));
  const so = validarFiltroDoRelatorio({ resultados: ['DENIED'] });
  assert.equal(so.ok, true);
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, so.filtro);
  assert.equal(r.mostrados, 1);
  assert.equal(r.itens[0].resultado, 'DENIED');

  assert.equal(validarFiltroDoRelatorio({ resultados: ['NEGADO'] }).ok, false);
  assert.equal(validarFiltroDoRelatorio({ resultados: 'DENIED' }).ok, false);
});

test('o filtro de ação aceita o formato com motivo da recusa', () => {
  // O guard grava `consultar:SEM_CONCESSAO`, e procurar por isso é exatamente
  // o que alguém quer ao investigar recusas.
  const ok = validarFiltroDoRelatorio({ acoes: ['consultar', 'consultar:SEM_CONCESSAO'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.filtro.acoes, ['consultar', 'consultar:SEM_CONCESSAO']);

  for (const ruim of ['CONSULTAR', 'co', 'com espaço', 'consultar:minuscula', 'x'.repeat(41), 42]) {
    assert.equal(validarFiltroDoRelatorio({ acoes: [ruim] }).ok, false, String(ruim));
  }
});

test('ação filtrada estreita de verdade', () => {
  const linhas = [linha({ action: 'consultar' }), linha({ action: 'suspender', correlationId: 'c2' })];
  const f = validarFiltroDoRelatorio({ acoes: ['suspender'] }).filtro;
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, f);
  assert.equal(r.mostrados, 1);
  assert.equal(r.itens[0].acao, 'suspender');
});

test('período estreita nos dois limites, inclusive', () => {
  const linhas = [
    linha({ occurredAt: new Date(T0 - 3600_000), correlationId: 'antes' }),
    linha({ occurredAt: new Date(T0), correlationId: 'meio' }),
    linha({ occurredAt: new Date(T0 + 3600_000), correlationId: 'depois' }),
  ];
  const f = validarFiltroDoRelatorio({ de: new Date(T0).toISOString(), ate: new Date(T0).toISOString() }).filtro;
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, f);
  assert.equal(r.mostrados, 1);
  assert.equal(r.itens[0].correlacao, 'meio');
});

test('período invertido é recusado, e data inválida também', () => {
  assert.equal(validarFiltroDoRelatorio({ de: '2026-03-31', ate: '2026-03-01' }).ok, false);
  for (const ruim of ['ontem', '2026-13-45', 42, {}]) {
    assert.equal(validarFiltroDoRelatorio({ de: ruim }).ok, false, String(ruim));
  }
  for (const vazio of ['', null, undefined]) {
    assert.equal(validarFiltroDoRelatorio({ de: vazio }).ok, true, String(vazio));
  }
});

test('autor e alvo estreitam, e id inválido é recusado', () => {
  const linhas = [linha({ actorUserId: id(1) }), linha({ actorUserId: id(2), correlationId: 'c2' })];
  const f = validarFiltroDoRelatorio({ actorUserId: id(2) }).filtro;
  assert.equal(montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, f).itens[0].autor, id(2));

  for (const ruim of ['curto', 'com+mais', 'x'.repeat(65), 7]) {
    assert.equal(validarFiltroDoRelatorio({ actorUserId: ruim }).ok, false, String(ruim));
    assert.equal(validarFiltroDoRelatorio({ targetUserId: ruim }).ok, false, String(ruim));
  }
});

test('lista de ações acima do teto é recusada, e no teto passa', () => {
  // Sem dígitos: nenhuma ação real tem, e a regex recusa com razão. Foi o
  // dado deste teste que estava errado na primeira versão, não o filtro.
  const letras = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const muitas = Array.from({ length: MAX_ACOES_NO_FILTRO + 1 }, (_, i) => `acao_${letras[i]}${letras[i]}${letras[i]}`);
  assert.equal(validarFiltroDoRelatorio({ acoes: muitas }).ok, false);
  assert.equal(validarFiltroDoRelatorio({ acoes: muitas.slice(0, MAX_ACOES_NO_FILTRO) }).ok, true);
  assert.equal(MAX_ACOES_NO_FILTRO, 20);
});

test('limite é inteiro, tem teto e tem piso', () => {
  assert.equal(validarFiltroDoRelatorio({ limite: 10 }).filtro.limite, 10);
  assert.equal(validarFiltroDoRelatorio({ limite: LIMITE_MAXIMO }).filtro.limite, LIMITE_MAXIMO);
  for (const ruim of [0, -1, 1.5, '10', LIMITE_MAXIMO + 1, Number.NaN]) {
    assert.equal(validarFiltroDoRelatorio({ limite: ruim }).ok, false, String(ruim));
  }
  assert.equal(LIMITE_PADRAO, 100);
  assert.equal(LIMITE_MAXIMO, 500);
});

test('todos os problemas do filtro vêm juntos', () => {
  const r = validarFiltroDoRelatorio({ de: 'ontem', acoes: ['NAO'], resultados: ['X'], actorUserId: 'curto', limite: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.erros.length >= 5, r.erros.join(' | '));
  assert.equal(new Set(r.erros).size, r.erros.length);
});

// --------------------------------------------------- ordem e truncamento

test('mais recente primeiro, que é a ordem que um auditor lê', () => {
  const linhas = [
    linha({ occurredAt: new Date(T0 - 1000), correlationId: 'velha' }),
    linha({ occurredAt: new Date(T0 + 1000), correlationId: 'nova' }),
    linha({ occurredAt: new Date(T0), correlationId: 'meio' }),
  ];
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, filtroPadrao());
  assert.deepEqual(r.itens.map((i) => i.correlacao), ['nova', 'meio', 'velha']);
});

test('truncamento nunca é silencioso, e os agregados dizem sobre o que são', () => {
  const linhas = Array.from({ length: 5 }, (_, i) => linha({ occurredAt: new Date(T0 + i), correlationId: `c${i}` }));
  const f = validarFiltroDoRelatorio({ limite: 3 }).filtro;
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, f);
  assert.equal(r.mostrados, 3);
  assert.equal(r.truncado, true);
  assert.equal(r.agregadosSobre, 'pagina', 'agregado de página não pode se passar por total');
  assert.equal(r.porResultado.ALLOWED, 3, 'conta o que mostrou, não o que existia');
});

test('sem truncamento os agregados são sobre tudo', () => {
  const linhas = Array.from({ length: 3 }, (_, i) => linha({ correlationId: `c${i}` }));
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, validarFiltroDoRelatorio({ limite: 3 }).filtro);
  assert.equal(r.truncado, false);
  assert.equal(r.agregadosSobre, 'tudo');
  assert.equal(r.mostrados, 3);
});

test('o corte fica no limite exato, não um a mais nem um a menos', () => {
  const linhas = Array.from({ length: 4 }, (_, i) => linha({ correlationId: `c${i}` }));
  assert.equal(montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, validarFiltroDoRelatorio({ limite: 4 }).filtro).truncado, false);
  assert.equal(montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, validarFiltroDoRelatorio({ limite: 3 }).filtro).truncado, true);
});

// ----------------------------------------------------------- forma do item

test('a sentinela vazia do schema vira ausência no relatório, não string vazia', () => {
  const r = montarRelatorio([linha({ targetUserId: '', organizationId: '' })], { tipo: 'PLATAFORMA' }, filtroPadrao());
  assert.equal(r.itens[0].alvo, null);
  assert.equal(r.itens[0].organizationId, null);
  assert.equal(r.itens[0].eventId, EV_A);
});

test('o motivo escrito pela pessoa vai inteiro para o relatório', () => {
  // É o motivo que explica a ação; cortar aqui esvaziaria a trilha.
  const motivo = 'Suspensão por denúncia verificada pela equipe de moderação em 13/11.';
  const r = montarRelatorio([linha({ reason: motivo })], { tipo: 'PLATAFORMA' }, filtroPadrao());
  assert.equal(r.itens[0].motivo, motivo);
});

test('alterações ausentes aparecem como nulo, e presentes passam intactas', () => {
  const comAlteracao = { falha: 'AUDITORIA', detalhe: 'Error: disco cheio' };
  const r = montarRelatorio(
    [linha({ changes: null }), linha({ changes: comAlteracao, correlationId: 'c2', occurredAt: new Date(T0 - 1) })],
    { tipo: 'PLATAFORMA' }, filtroPadrao(),
  );
  assert.equal(r.itens[0].alteracoes, null);
  assert.deepEqual(r.itens[1].alteracoes, comAlteracao);
});

test('a data sai em ISO, venha como Date ou como texto', () => {
  const r = montarRelatorio(
    [linha({ occurredAt: new Date(T0) }), linha({ occurredAt: new Date(T0 - 1).toISOString(), correlationId: 'c2' })],
    { tipo: 'PLATAFORMA' }, filtroPadrao(),
  );
  assert.equal(r.itens[0].quando, new Date(T0).toISOString());
  assert.equal(r.itens[1].quando, new Date(T0 - 1).toISOString());
});

test('por ação vem ordenado pelo maior, com desempate estável', () => {
  const linhas = [
    ...Array.from({ length: 3 }, (_, i) => linha({ action: 'consultar', correlationId: `a${i}` })),
    linha({ action: 'suspender', correlationId: 'b' }),
    linha({ action: 'auditar', correlationId: 'c' }),
  ];
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, filtroPadrao());
  assert.deepEqual(r.porAcao, [
    { chave: 'consultar', total: 3 },
    { chave: 'auditar', total: 1 },
    { chave: 'suspender', total: 1 },
  ]);
});

test('o escopo pedido volta no relatório, para quem lê saber o alcance', () => {
  const escopo = { tipo: 'EVENTO', eventId: EV_A };
  assert.deepEqual(montarRelatorio([], escopo, filtroPadrao()).escopo, escopo);
});

test('trilha vazia é relatório vazio, não erro', () => {
  const r = montarRelatorio([], { tipo: 'PLATAFORMA' }, filtroPadrao());
  assert.equal(r.mostrados, 0);
  assert.equal(r.truncado, false);
  assert.deepEqual(r.itens, []);
  assert.deepEqual(r.porAcao, []);
  assert.deepEqual(r.porResultado, { ALLOWED: 0, DENIED: 0, FAILED: 0 });
});

test('corpo que não é objeto é recusado de uma vez', () => {
  for (const ruim of ['texto', 42, [], [1]]) {
    const r = validarFiltroDoRelatorio(ruim);
    assert.equal(r.ok, false, String(ruim));
    assert.deepEqual(r.erros, ['Filtro inválido.']);
  }
});

// --------------------------------- lacunas encontradas pela rodada de mutação

test('filtrar por ALVO estreita de verdade, não só por autor', () => {
  // A versão anterior deste arquivo exercitava o estreitamento só do autor; do
  // alvo testava apenas a recusa de id inválido. Remover o filtro de alvo
  // passava sem ninguém ver.
  const linhas = [
    linha({ targetUserId: id(7), correlationId: 'do-sete' }),
    linha({ targetUserId: id(8), correlationId: 'do-oito' }),
    linha({ targetUserId: '', correlationId: 'sem-alvo' }),
  ];
  const f = validarFiltroDoRelatorio({ targetUserId: id(8) }).filtro;
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, f);
  assert.equal(r.mostrados, 1);
  assert.equal(r.itens[0].correlacao, 'do-oito');
  assert.equal(r.itens[0].alvo, id(8));
});

test('autor e alvo são filtros independentes, e combinam', () => {
  const linhas = [
    linha({ actorUserId: id(1), targetUserId: id(7), correlationId: 'um-sete' }),
    linha({ actorUserId: id(1), targetUserId: id(8), correlationId: 'um-oito' }),
    linha({ actorUserId: id(2), targetUserId: id(8), correlationId: 'dois-oito' }),
  ];
  const f = validarFiltroDoRelatorio({ actorUserId: id(1), targetUserId: id(8) }).filtro;
  const r = montarRelatorio(linhas, { tipo: 'PLATAFORMA' }, f);
  assert.equal(r.mostrados, 1);
  assert.equal(r.itens[0].correlacao, 'um-oito');
});

test('alterações ausentes aparecem como nulo mesmo vindo indefinidas', () => {
  // Campo ausente num relatório é ambíguo: quem lê não sabe se não houve
  // alteração ou se o relatório esqueceu de contar. `undefined` desaparece do
  // JSON; `null` fica e diz "não houve".
  const r = montarRelatorio([linha({ changes: undefined })], { tipo: 'PLATAFORMA' }, filtroPadrao());
  assert.equal(r.itens[0].alteracoes, null);
  assert.ok('alteracoes' in r.itens[0], 'a chave tem de existir na resposta');
  assert.equal(JSON.stringify(r.itens[0]).includes('"alteracoes":null'), true);
});
