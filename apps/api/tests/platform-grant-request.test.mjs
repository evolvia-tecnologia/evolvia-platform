import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACOES_PEDIVEIS,
  CAMPOS,
  MAX_EVENTOS,
  MAX_PESSOAS,
  MOTIVO_MINIMO,
  resumoDaConcessao,
  validarPedidoDeConcessao,
} from '../src/platform-grant-request.ts';

/**
 * Pedido de concessão e resumo de confirmação da Área Master (#665, M3).
 *
 * O resumo é a última chance de alguém perceber que a concessão dá poder
 * demais, porque concessão é a operação cujo erro só aparece quando outra
 * pessoa usa o poder. Por isso ele é testado como contrato, não como texto
 * bonito: eventos futuros e ações sensíveis têm de estar em destaque.
 */

const AGORA = new Date('2026-11-12T12:00:00.000Z').getTime();
const futuro = new Date(AGORA + 86_400_000).toISOString();
const passado = new Date(AGORA - 1000).toISOString();

const ID = (n) => `clx${String(n).padStart(8, '0')}`;
const MOTIVO = 'auditoria do trimestre pedida pelo juridico';
const ler = (corpo) => validarPedidoDeConcessao(corpo, AGORA);
const base = (extra = {}) => ({
  pessoas: [ID(1)],
  acoes: ['consultar'],
  escopo: { tipo: 'GLOBAL' },
  motivo: MOTIVO,
  ...extra,
});

// ------------------------------------------------------ pedido bem formado
test('pedido mínimo bem formado é aceito e normalizado', () => {
  const r = ler(base());
  assert.equal(r.ok, true, r.ok ? '' : r.erros.join(' | '));
  assert.deepEqual(r.pedido.pessoas, [ID(1)]);
  assert.deepEqual(r.pedido.acoes, ['consultar']);
  assert.deepEqual(r.pedido.escopo, { tipo: 'GLOBAL' });
  assert.equal(r.pedido.expiraEm, null, 'prazo é opcional');
});

test('as ações saem na ordem do catálogo, não na de chegada', () => {
  const r = ler(base({ acoes: ['excluir', 'consultar', 'auditar'] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.pedido.acoes, ['consultar', 'auditar', 'excluir'],
    'resumo tem de ser estável para quem confere duas vezes');
});

test('pessoa e evento repetidos entram uma vez só', () => {
  const r = ler(base({
    pessoas: [ID(1), ID(1), ID(2)],
    escopo: { tipo: 'EVENTOS', eventIds: [ID(9), ID(9)] },
  }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.pedido.pessoas, [ID(1), ID(2)]);
  assert.deepEqual(r.pedido.escopo.eventIds, [ID(9)]);
});

test('motivo é normalizado em espaço, e o prazo volta em ISO', () => {
  const r = ler(base({ motivo: '  auditoria    do   trimestre pedida  ', expiraEm: futuro }));
  assert.equal(r.ok, true);
  assert.equal(r.pedido.motivo, 'auditoria do trimestre pedida');
  assert.equal(r.pedido.expiraEm, futuro);
});

// ------------------------------------------------------ recusas acumuladas
test('todos os problemas vêm de uma vez, não um por tentativa', () => {
  const r = ler({ pessoas: [], acoes: [], escopo: null, motivo: '', expiraEm: 'ontem' });
  assert.equal(r.ok, false);
  assert.equal(r.erros.length, 5, r.erros.join(' | '));
});

test('corpo que não é objeto é recusado sem estourar', () => {
  for (const corpo of [null, undefined, 'texto', 42, [], true]) {
    const r = ler(corpo);
    assert.equal(r.ok, false, JSON.stringify(corpo));
  }
});

test('sem pessoa, sem ação ou sem alcance não há concessão', () => {
  assert.match(ler(base({ pessoas: [] })).erros.join(), /ao menos uma pessoa/u);
  assert.match(ler(base({ acoes: [] })).erros.join(), /ao menos uma ação/u);
  assert.match(ler(base({ escopo: undefined })).erros.join(), /alcance/u);
});

test('ação fora do catálogo é recusada, e não silenciosamente descartada', () => {
  const r = ler(base({ acoes: ['consultar', 'administrar_equipe'] }));
  assert.equal(r.ok, false, 'administrar equipe não é concedível: não pode entrar nem de carona');
  assert.match(r.erros.join(), /não existe no catálogo/u);
});

test('id malformado é recusado em pessoa e em evento', () => {
  for (const ruim of ['', '   ', 'curto', 'id com espaco', '../../etc/passwd', '<script>', 'x'.repeat(65), 7, null]) {
    assert.equal(ler(base({ pessoas: [ruim] })).ok, false, `pessoa ${JSON.stringify(ruim)}`);
    assert.equal(ler(base({ escopo: { tipo: 'EVENTOS', eventIds: [ruim] } })).ok, false, `evento ${JSON.stringify(ruim)}`);
  }
});

test('alcance de tipo desconhecido é recusado', () => {
  for (const escopo of [{ tipo: 'TUDO' }, { tipo: 'EVENTO' }, {}, { tipo: 'GLOBAL', extra: 1 }]) {
    const r = ler(base({ escopo }));
    if (escopo.tipo === 'GLOBAL') {
      assert.equal(r.ok, true, 'campo a mais no escopo é ignorado, não é erro');
    } else {
      assert.equal(r.ok, false, JSON.stringify(escopo));
    }
  }
});

test('organização e lista de eventos exigem conteúdo', () => {
  assert.equal(ler(base({ escopo: { tipo: 'ORGANIZACAO' } })).ok, false);
  assert.equal(ler(base({ escopo: { tipo: 'EVENTOS', eventIds: [] } })).ok, false);
  assert.equal(ler(base({ escopo: { tipo: 'ORGANIZACAO', organizationId: ID(3) } })).ok, true);
});

test('motivo curto é recusado, com o mínimo dito na mensagem', () => {
  const r = ler(base({ motivo: 'x'.repeat(MOTIVO_MINIMO - 1) }));
  assert.equal(r.ok, false);
  assert.match(r.erros.join(), new RegExp(`${MOTIVO_MINIMO} caracteres`, 'u'));
  assert.equal(ler(base({ motivo: 'x'.repeat(MOTIVO_MINIMO) })).ok, true);
  assert.equal(ler(base({ motivo: 'x'.repeat(201) })).ok, false);
});

test('prazo no passado ou no instante exato é recusado', () => {
  assert.equal(ler(base({ expiraEm: passado })).ok, false);
  assert.equal(ler(base({ expiraEm: new Date(AGORA).toISOString() })).ok, false, 'expirar agora não é prazo');
  assert.equal(ler(base({ expiraEm: new Date(AGORA + 1).toISOString() })).ok, true);
  assert.equal(ler(base({ expiraEm: 'amanhã' })).ok, false);
  assert.equal(ler(base({ expiraEm: 12345 })).ok, false);
  assert.equal(ler(base({ expiraEm: null })).ok, true, 'nulo é ausência de prazo, não erro');
});

test('limites de tamanho são recusados nomeando o limite', () => {
  const muitas = Array.from({ length: MAX_PESSOAS + 1 }, (_, i) => ID(i + 1));
  assert.match(ler(base({ pessoas: muitas })).erros.join(), new RegExp(`${MAX_PESSOAS} pessoas`, 'u'));
  const muitos = Array.from({ length: MAX_EVENTOS + 1 }, (_, i) => ID(i + 1));
  assert.match(ler(base({ escopo: { tipo: 'EVENTOS', eventIds: muitos } })).erros.join(), new RegExp(`${MAX_EVENTOS} eventos`, 'u'));
});

// O limite EXATO tem de ser aceito. Sem este caso, trocar `>` por `>=` não
// quebrava teste nenhum: eu só testava o excedente. Mutante sobreviveu e
// mostrou isso.
test('o limite exato de pessoas e de eventos é aceito', () => {
  const nasConta = Array.from({ length: MAX_PESSOAS }, (_, i) => ID(i + 1));
  const r = ler(base({ pessoas: nasConta }));
  assert.equal(r.ok, true, r.ok ? '' : r.erros.join(' | '));
  assert.equal(r.pedido.pessoas.length, MAX_PESSOAS);

  const eventos = Array.from({ length: MAX_EVENTOS }, (_, i) => ID(i + 1));
  const e = ler(base({ escopo: { tipo: 'EVENTOS', eventIds: eventos } }));
  assert.equal(e.ok, true, e.ok ? '' : e.erros.join(' | '));
  assert.equal(e.pedido.escopo.eventIds.length, MAX_EVENTOS);
});

// ------------------------------------------- o CAMPO de cada recusa
//
// Antes, a recusa saía só com a frase, e o contrato de erro da plataforma ia
// com `field` vazio: a mensagem certa, sem nada para o formulário destacar nem
// para o leitor de tela anunciar. Num pedido com quatro problemas, a pessoa
// tinha de descobrir sozinha a qual campo cada frase se referia.
//
// Estes casos existem porque o `field` é consumido por código que não aparece
// aqui: errar um nome não quebraria nada visivelmente, só produziria destaque
// que cai no vazio.

test('cada recusa nomeia o campo que o formulário deve destacar', () => {
  const casos = [
    [{ pessoas: [] }, CAMPOS.pessoas],
    [{ pessoas: Array.from({ length: MAX_PESSOAS + 1 }, (_, i) => ID(i + 1)) }, CAMPOS.pessoas],
    [{ pessoas: ['curto'] }, CAMPOS.pessoas],
    [{ acoes: [] }, CAMPOS.acoes],
    [{ acoes: ['administrar_equipe'] }, CAMPOS.acoes],
    [{ escopo: undefined }, CAMPOS.escopo],
    [{ escopo: { tipo: 'TUDO' } }, CAMPOS.escopo],
    [{ escopo: { tipo: 'ORGANIZACAO' } }, CAMPOS.organizacao],
    [{ escopo: { tipo: 'EVENTOS', eventIds: [] } }, CAMPOS.eventos],
    [{ escopo: { tipo: 'EVENTOS', eventIds: Array.from({ length: MAX_EVENTOS + 1 }, (_, i) => ID(i + 1)) } }, CAMPOS.eventos],
    [{ escopo: { tipo: 'EVENTOS', eventIds: ['curto'] } }, CAMPOS.eventos],
    [{ motivo: 'curto' }, CAMPOS.motivo],
    [{ motivo: 'x'.repeat(201) }, CAMPOS.motivo],
    [{ expiraEm: 'amanhã' }, CAMPOS.prazo],
    [{ expiraEm: 12345 }, CAMPOS.prazo],
    [{ expiraEm: passado }, CAMPOS.prazo],
  ];
  for (const [extra, esperado] of casos) {
    const r = ler(base(extra));
    assert.equal(r.ok, false, JSON.stringify(extra));
    assert.equal(r.problemas.length, 1, `${JSON.stringify(extra)} produziu ${r.problemas.length} problemas`);
    assert.equal(r.problemas[0].campo, esperado, JSON.stringify(extra));
  }
});

test('o subcampo da organização é destacado, não o escopo inteiro', () => {
  // Quem escolheu "organização" e errou o id precisa que o destaque caia no
  // seletor de organização, não no grupo de alcance inteiro.
  const r = ler(base({ escopo: { tipo: 'ORGANIZACAO', organizationId: 'curto' } }));
  assert.equal(r.problemas[0].campo, 'escopo.organizationId');
  assert.notEqual(r.problemas[0].campo, 'escopo');
});

test('corpo inteiro inválido não finge pertencer a um campo', () => {
  for (const corpo of [null, 'texto', 42, []]) {
    const r = ler(corpo);
    assert.equal(r.problemas.length, 1, JSON.stringify(corpo));
    assert.equal(r.problemas[0].campo, '', 'inventar campo aqui daria destaque errado');
    assert.equal(r.problemas[0].mensagem, 'Pedido inválido.');
  }
});

test('problemas acumulados preservam o campo de cada um, na ordem de leitura', () => {
  const r = ler({ pessoas: [], acoes: [], escopo: null, motivo: '', expiraEm: 'ontem' });
  assert.deepEqual(r.problemas.map((p) => p.campo),
    [CAMPOS.pessoas, CAMPOS.acoes, CAMPOS.escopo, CAMPOS.motivo, CAMPOS.prazo]);
});

test('erros é derivado de problemas, nunca mantido em paralelo', () => {
  // Se um dia alguém acrescentar uma recusa só em `erros`, as duas listas
  // divergem e a tela destaca um campo a menos do que a API recusou.
  const r = ler({ pessoas: [], acoes: [], escopo: null, motivo: '', expiraEm: 'ontem' });
  assert.deepEqual(r.erros, r.problemas.map((p) => p.mensagem));
  assert.equal(r.erros.length, r.problemas.length);
});

test('todo campo nomeado existe no corpo que o DTO aceita', () => {
  // Um `field` que não corresponde a nada no corpo é destaque que cai no vazio.
  // A raiz de cada caminho pontuado tem de ser um campo do RevisarConcessaoDto.
  const doDto = new Set(['pessoas', 'acoes', 'escopo', 'motivo', 'expiraEm']);
  for (const [chave, caminho] of Object.entries(CAMPOS)) {
    if (caminho === '') continue;
    const raiz = caminho.split('.')[0];
    assert.ok(doDto.has(raiz), `CAMPOS.${chave} aponta para "${caminho}", fora do DTO`);
  }
});

// ------------------------------------------------------ o resumo de confirmação
const pedidoDe = (corpo) => {
  const r = ler(corpo);
  assert.equal(r.ok, true, r.ok ? '' : r.erros.join(' | '));
  return r.pedido;
};

test('alcance global diz expressamente que inclui eventos futuros', () => {
  const resumo = resumoDaConcessao(pedidoDe(base()));
  assert.ok(resumo.linhas.some((l) => /inclui eventos futuros/u.test(l)), resumo.linhas.join(' | '));
  assert.equal(resumo.alcancaEventosFuturos, true);
  assert.ok(resumo.destaques.some((d) => /criados depois de hoje/u.test(d)));
});

test('alcance de organização também alcança o futuro, e diz isso', () => {
  const resumo = resumoDaConcessao(pedidoDe(base({ escopo: { tipo: 'ORGANIZACAO', organizationId: ID(3) } })));
  assert.equal(resumo.alcancaEventosFuturos, true);
  assert.ok(resumo.destaques.some((d) => /criados depois de hoje/u.test(d)));
});

test('lista de eventos NÃO alcança o futuro, e não promete que alcança', () => {
  const resumo = resumoDaConcessao(pedidoDe(base({ escopo: { tipo: 'EVENTOS', eventIds: [ID(9), ID(8)] } })));
  assert.equal(resumo.alcancaEventosFuturos, false);
  assert.equal(resumo.destaques.some((d) => /criados depois de hoje/u.test(d)), false);
  assert.ok(resumo.linhas.some((l) => /2 eventos selecionados/u.test(l)));
});

test('um evento só é dito no singular', () => {
  const resumo = resumoDaConcessao(pedidoDe(base({ escopo: { tipo: 'EVENTOS', eventIds: [ID(9)] } })));
  assert.ok(resumo.linhas.some((l) => /1 evento selecionado/u.test(l)), resumo.linhas.join(' | '));
});

test('ação sensível é destacada, com o que ela vai exigir', () => {
  const resumo = resumoDaConcessao(pedidoDe(base({ acoes: ['consultar', 'suspender', 'excluir'] })));
  assert.deepEqual(resumo.acoesSensiveis, ['suspender', 'excluir']);
  const destaque = resumo.destaques.find((d) => /sens/u.test(d));
  assert.ok(destaque, resumo.destaques.join(' | '));
  assert.match(destaque, /suspender evento, excluir evento/u);
  assert.match(destaque, /motivo escrito e verificação reforçada/u);
});

test('só consulta não gera destaque de ação sensível', () => {
  const resumo = resumoDaConcessao(pedidoDe(base({ acoes: ['consultar', 'auditar', 'relatorios'] })));
  assert.deepEqual(resumo.acoesSensiveis, []);
  assert.equal(resumo.destaques.some((d) => /sens/u.test(d)), false);
});

test('ausência de prazo é destacada: vale até revogar', () => {
  const semPrazo = resumoDaConcessao(pedidoDe(base()));
  assert.ok(semPrazo.linhas.some((l) => /sem data de fim/u.test(l)));
  assert.ok(semPrazo.destaques.some((d) => /até você revogar/u.test(d)));

  const comPrazo = resumoDaConcessao(pedidoDe(base({ expiraEm: futuro })));
  assert.ok(comPrazo.linhas.some((l) => l.includes(futuro)));
  assert.equal(comPrazo.destaques.some((d) => /até você revogar/u.test(d)), false);
});

test('com nomes o resumo fica humano; sem nomes, conta pessoas e não inventa', () => {
  const pedido = pedidoDe(base({ pessoas: [ID(1), ID(2)] }));
  const comNomes = resumoDaConcessao(pedido, { [ID(1)]: 'Ana Souza', [ID(2)]: 'Bia Lima' });
  assert.ok(comNomes.linhas[0].includes('Ana Souza, Bia Lima'), comNomes.linhas[0]);

  const semNomes = resumoDaConcessao(pedido);
  assert.ok(semNomes.linhas[0].includes('2 pessoas'), semNomes.linhas[0]);
  assert.equal(semNomes.linhas[0].includes(ID(1)), false, 'id de pessoa não entra no texto de leitura');

  // Nome faltando para uma das pessoas: conta, em vez de listar pela metade.
  const parcial = resumoDaConcessao(pedido, { [ID(1)]: 'Ana Souza' });
  assert.ok(parcial.linhas[0].includes('2 pessoas'), parcial.linhas[0]);
  assert.equal(parcial.linhas[0].includes('Ana Souza'), false, 'lista pela metade seria pior que contagem');
});

test('uma pessoa é dita no singular', () => {
  const resumo = resumoDaConcessao(pedidoDe(base()));
  assert.ok(resumo.linhas[0].includes('1 pessoa'), resumo.linhas[0]);
  assert.equal(resumo.linhas[0].includes('pessoas'), false);
});

test('o motivo aparece no resumo: é ele que a auditoria vai guardar', () => {
  const resumo = resumoDaConcessao(pedidoDe(base()));
  assert.ok(resumo.linhas.some((l) => l.includes(MOTIVO)), resumo.linhas.join(' | '));
});

test('o catálogo de ações do pedido é o mesmo da política de decisão', () => {
  // Se os dois divergirem, a tela ofereceria ação que o servidor nega, ou o
  // contrário. Fixado aqui porque os arquivos são separados de propósito.
  assert.deepEqual([...ACOES_PEDIVEIS], [
    'consultar', 'auditar', 'relatorios', 'suporte', 'suspender', 'desbloquear', 'excluir', 'restaurar',
  ]);
});
