import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACOES, CLASSIFICACOES, ESTADOS, LIMITE_DA_REFERENCIA, LIMITE_DO_MOTIVO, OPERACOES,
  STATUS_SUSPENSO_PELA_PLATAFORMA, apresentacaoPublica, barradasPor, decidirModeracao, permite,
} from '../src/platform-moderation-policy.ts';

const ATOR = 'usr_master';
const OUTRO = 'usr_segundo';
const STATUS_DO_EVENTO = ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'FINISHED', 'CANCELLED'];

const p = (over = {}) => ({
  acao: 'suspender',
  estadoAtual: 'ATIVO',
  statusDoEvento: 'PUBLISHED',
  statusOriginal: null,
  estadoAnterior: null,
  ehMaster: true,
  atorUserId: ATOR,
  classificacao: 'VIOLACAO_DE_REGRA',
  motivo: 'Denúncia procedente após apuração.',
  referenciaDoCaso: 'CASO-2026-0001',
  ...over,
});

test('autorização é conferida ANTES da forma: quem não é Master não aprende o estado', () => {
  const d = decidirModeracao(p({ ehMaster: false, classificacao: 'lixo', motivo: '', referenciaDoCaso: '' }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'ator_nao_e_master');
  for (const ehMaster of [false, undefined, null, 'true', 1, {}]) {
    assert.equal(decidirModeracao(p({ ehMaster })).motivo, 'ator_nao_e_master', `aceitou ${String(ehMaster)}`);
  }
  assert.equal(decidirModeracao(p({ atorUserId: '   ' })).motivo, 'ator_nao_e_master');
});

test('ação e estado desconhecidos negam antes de tudo', () => {
  for (const acao of ['apagar', '', undefined, null, 42, 'SUSPENDER']) {
    assert.equal(decidirModeracao(p({ acao })).motivo, 'acao_desconhecida', `aceitou ação ${String(acao)}`);
  }
  for (const estadoAtual of ['ativo', '', undefined, null, 42, 'DELETADO']) {
    assert.equal(decidirModeracao(p({ estadoAtual })).motivo, 'estado_desconhecido', `aceitou estado ${String(estadoAtual)}`);
  }
});

test('classificação, motivo e referência são obrigatórios e limitados', () => {
  for (const classificacao of ['', 'FRAUDE', undefined, null, 42]) {
    assert.equal(decidirModeracao(p({ classificacao })).motivo, 'classificacao_invalida');
  }
  for (const c of CLASSIFICACOES) assert.equal(decidirModeracao(p({ classificacao: c })).permitido, true);
  for (const motivo of ['', '   ', undefined, null, 42]) {
    assert.equal(decidirModeracao(p({ motivo })).motivo, 'motivo_obrigatorio');
  }
  assert.equal(decidirModeracao(p({ motivo: 'a'.repeat(LIMITE_DO_MOTIVO) })).permitido, true);
  assert.equal(decidirModeracao(p({ motivo: 'a'.repeat(LIMITE_DO_MOTIVO + 1) })).motivo, 'motivo_muito_longo');
  for (const ref of ['', '  ', undefined, null, 42]) {
    assert.equal(decidirModeracao(p({ referenciaDoCaso: ref })).motivo, 'referencia_obrigatoria');
  }
  assert.equal(decidirModeracao(p({ referenciaDoCaso: 'r'.repeat(LIMITE_DA_REFERENCIA + 1) })).motivo, 'referencia_muito_longa');
});

test('suspender fotografa o status do evento e o põe fora do ar', () => {
  for (const status of STATUS_DO_EVENTO) {
    const d = decidirModeracao(p({ statusDoEvento: status }));
    assert.equal(d.permitido, true, `suspender falhou em ${status}`);
    assert.equal(d.estadoNovo, 'SUSPENSO');
    assert.equal(d.statusDoEventoNovo, STATUS_SUSPENSO_PELA_PLATAFORMA);
    assert.equal(d.statusOriginalNovo, status, 'a fotografia tem de ser o status de agora');
  }
});

test('segunda suspensão é RECUSADA, não idempotente: ela apagaria a fotografia', () => {
  const d = decidirModeracao(p({ estadoAtual: 'SUSPENSO', statusOriginal: 'PUBLISHED' }));
  assert.equal(d.permitido, false);
  assert.equal(d.idempotente, false, 'tratar como idempotente esconderia a perda da memória do estado original');
  assert.equal(d.motivo, 'ja_suspenso');
  assert.equal(d.statusOriginalNovo, undefined, 'nada pode ser gravado numa recusa');
});

test('ida e volta devolve o status EXATO, para todo status possível', () => {
  for (const status of STATUS_DO_EVENTO) {
    const ida = decidirModeracao(p({ statusDoEvento: status }));
    const volta = decidirModeracao(p({
      acao: 'liberar', estadoAtual: 'SUSPENSO',
      statusDoEvento: ida.statusDoEventoNovo, statusOriginal: ida.statusOriginalNovo,
    }));
    assert.equal(volta.permitido, true, `liberar falhou vindo de ${status}`);
    assert.equal(volta.estadoNovo, 'ATIVO');
    assert.equal(volta.statusDoEventoNovo, status, `${status} não voltou exatamente`);
    assert.equal(volta.statusOriginalNovo, null, 'a fotografia tem de ser apagada ao voltar para ATIVO');
  }
});

test('rascunho suspenso JAMAIS volta publicado', () => {
  const ida = decidirModeracao(p({ statusDoEvento: 'DRAFT' }));
  const volta = decidirModeracao(p({ acao: 'liberar', estadoAtual: 'SUSPENSO', statusOriginal: ida.statusOriginalNovo }));
  assert.equal(volta.statusDoEventoNovo, 'DRAFT');
  assert.notEqual(volta.statusDoEventoNovo, 'PUBLISHED');
});

test('sem fotografia, liberar RECUSA em vez de assumir um padrão', () => {
  for (const statusOriginal of [null, undefined, 42, {}]) {
    const d = decidirModeracao(p({ acao: 'liberar', estadoAtual: 'SUSPENSO', statusOriginal }));
    assert.equal(d.permitido, false, `assumiu padrão com fotografia ${String(statusOriginal)}`);
    assert.equal(d.motivo, 'status_original_ausente');
  }
});

test('liberar o que não está suspenso: nada a fazer em ATIVO, recusa em REMOVIDO', () => {
  const emAtivo = decidirModeracao(p({ acao: 'liberar', estadoAtual: 'ATIVO' }));
  assert.equal(emAtivo.permitido, false);
  assert.equal(emAtivo.idempotente, true, 'liberar já liberado não é erro');
  const emRemovido = decidirModeracao(p({ acao: 'liberar', estadoAtual: 'REMOVIDO', statusOriginal: 'PUBLISHED' }));
  assert.equal(emRemovido.idempotente, false, 'remoção precisa de restauração explícita, não de liberação');
  assert.equal(emRemovido.motivo, 'nao_esta_suspenso');
});

test('remover exige suspensão antes, salvo pedido explícito', () => {
  const direto = decidirModeracao(p({ acao: 'remover', segundaAprovacaoPor: OUTRO }));
  assert.equal(direto.permitido, false);
  assert.equal(direto.motivo, 'remocao_exige_suspensao_previa');
  const comPedido = decidirModeracao(p({ acao: 'remover', segundaAprovacaoPor: OUTRO, permitirSemSuspensaoPrevia: true }));
  assert.equal(comPedido.permitido, true);
  assert.equal(comPedido.statusOriginalNovo, 'PUBLISHED', 'vindo de ATIVO, a fotografia é tirada agora');
});

test('remover exige segunda aprovação, de outra pessoa', () => {
  const base = { acao: 'remover', estadoAtual: 'SUSPENSO', statusOriginal: 'PUBLISHED' };
  for (const segunda of ['', '   ', undefined, null, 42]) {
    assert.equal(decidirModeracao(p({ ...base, segundaAprovacaoPor: segunda })).motivo,
      'remocao_exige_segunda_aprovacao', `aceitou ${String(segunda)}`);
  }
  assert.equal(decidirModeracao(p({ ...base, segundaAprovacaoPor: ATOR })).motivo, 'segunda_aprovacao_do_mesmo_ator');
  assert.equal(decidirModeracao(p({ ...base, segundaAprovacaoPor: ` ${ATOR} ` })).motivo, 'segunda_aprovacao_do_mesmo_ator',
    'espaço em volta não pode burlar a separação de funções');
  assert.equal(decidirModeracao(p({ ...base, segundaAprovacaoPor: OUTRO })).permitido, true);
});

test('remover vindo de SUSPENSO PRESERVA a fotografia original', () => {
  const d = decidirModeracao(p({
    acao: 'remover', estadoAtual: 'SUSPENSO', statusDoEvento: STATUS_SUSPENSO_PELA_PLATAFORMA,
    statusOriginal: 'READY_TO_PUBLISH', segundaAprovacaoPor: OUTRO,
  }));
  assert.equal(d.permitido, true);
  assert.equal(d.estadoNovo, 'REMOVIDO');
  assert.equal(d.statusOriginalNovo, undefined,
    'sobrescrever com o status suspenso perderia o original para sempre');
});

test('remover já removido é nada a fazer', () => {
  const d = decidirModeracao(p({ acao: 'remover', estadoAtual: 'REMOVIDO', segundaAprovacaoPor: OUTRO, statusOriginal: 'PUBLISHED' }));
  assert.equal(d.idempotente, true);
  assert.equal(d.motivo, 'ja_removido');
});

test('suspender um evento REMOVIDO recusa dizendo que ele JÁ está removido', () => {
  // Apontamento do Gemini na #691, e procede. O motivo era `nao_esta_removido`:
  // a mensagem afirmava o oposto do estado real, porque o evento ESTÁ removido.
  // Medido antes do reparo — motivo `nao_esta_removido`, idempotente false.
  //
  // `ja_removido` já existe no catálogo e `remover` o usa como idempotente.
  // Aqui é RECUSA, e a diferença é deliberada: remoção é mais restritiva que
  // suspensão, então pedir suspensão de um evento removido parte de um modelo
  // mental errado, e tratar como "nada a fazer" esconderia isso de quem opera.
  // O código do motivo descreve o ESTADO; quem diz se havia o que fazer é
  // `idempotente`.
  const d = decidirModeracao(p({ acao: 'suspender', estadoAtual: 'REMOVIDO', statusOriginal: 'PUBLISHED' }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'ja_removido', 'o motivo tem de descrever o estado real do evento');
  assert.equal(d.idempotente, false, 'remoção é mais restritiva: pedir suspensão não é "nada a fazer"');
  assert.equal(d.estadoNovo, null);
  assert.equal(d.statusOriginalNovo, undefined, 'nada pode ser gravado numa recusa');
});

test('nenhum motivo de recusa afirma o contrário do estado informado', () => {
  // A generalização do defeito acima, para que ele não volte em outro ramo.
  // Um motivo `nao_esta_X` não pode sair quando o estado atual É X, e um
  // `ja_X` não pode sair quando o estado NÃO é X. Vale para as doze
  // transições, inclusive as idempotentes.
  const nomeDoEstado = { ATIVO: 'ativo', SUSPENSO: 'suspenso', REMOVIDO: 'removido' };
  for (const acao of ACOES) {
    for (const estadoAtual of ESTADOS) {
      const d = decidirModeracao(p({
        acao, estadoAtual, statusOriginal: 'PUBLISHED', estadoAnterior: 'SUSPENSO',
        segundaAprovacaoPor: OUTRO, permitirSemSuspensaoPrevia: true,
      }));
      if (d.permitido || !d.motivo) continue;
      assert.notEqual(d.motivo, `nao_esta_${nomeDoEstado[estadoAtual]}`,
        `${acao} em ${estadoAtual} recusou com "${d.motivo}", que NEGA o estado informado`);
      for (const [outro, nome] of Object.entries(nomeDoEstado)) {
        if (outro === estadoAtual) continue;
        assert.notEqual(d.motivo, `ja_${nome}`,
          `${acao} em ${estadoAtual} recusou com "${d.motivo}", que afirma um estado DIFERENTE do informado`);
      }
    }
  }
});

test('restaurar devolve o estado de moderação anterior, não um padrão', () => {
  const paraAtivo = decidirModeracao(p({ acao: 'restaurar', estadoAtual: 'REMOVIDO', estadoAnterior: 'ATIVO', statusOriginal: 'SETUP' }));
  assert.equal(paraAtivo.estadoNovo, 'ATIVO');
  assert.equal(paraAtivo.statusDoEventoNovo, 'SETUP');
  assert.equal(paraAtivo.statusOriginalNovo, null);

  const paraSuspenso = decidirModeracao(p({ acao: 'restaurar', estadoAtual: 'REMOVIDO', estadoAnterior: 'SUSPENSO', statusOriginal: 'PUBLISHED' }));
  assert.equal(paraSuspenso.estadoNovo, 'SUSPENSO', 'quem estava suspenso não volta ao ar por uma restauração');
  assert.equal(paraSuspenso.statusDoEventoNovo, STATUS_SUSPENSO_PELA_PLATAFORMA);
  assert.equal(paraSuspenso.statusOriginalNovo, undefined, 'a fotografia continua necessária');
});

test('restaurar o que não está removido é recusado', () => {
  for (const estadoAtual of ['ATIVO', 'SUSPENSO']) {
    const d = decidirModeracao(p({ acao: 'restaurar', estadoAtual, statusOriginal: 'PUBLISHED' }));
    assert.equal(d.permitido, false);
    assert.equal(d.motivo, 'nao_esta_removido');
  }
});

test('as doze transições têm resultado declarado, nenhuma cai em silêncio', () => {
  for (const acao of ACOES) {
    for (const estadoAtual of ESTADOS) {
      const d = decidirModeracao(p({
        acao, estadoAtual, statusOriginal: 'PUBLISHED', estadoAnterior: 'SUSPENSO',
        segundaAprovacaoPor: OUTRO, permitirSemSuspensaoPrevia: true,
      }));
      assert.equal(typeof d.permitido, 'boolean', `${acao}/${estadoAtual} sem veredito`);
      if (!d.permitido) assert.ok(d.motivo, `${acao}/${estadoAtual} recusou sem motivo`);
      if (d.permitido) assert.ok(d.estadoNovo, `${acao}/${estadoAtual} permitiu sem estado novo`);
    }
  }
});

test('recusa nunca devolve nada para gravar', () => {
  const recusas = [
    p({ ehMaster: false }), p({ acao: 'x' }), p({ estadoAtual: 'SUSPENSO' }),
    p({ motivo: '' }), p({ referenciaDoCaso: '' }), p({ classificacao: 'x' }),
  ];
  for (const pedido of recusas) {
    const d = decidirModeracao(pedido);
    assert.equal(d.permitido, false);
    assert.equal(d.estadoNovo, null);
    assert.equal(d.statusDoEventoNovo, null);
    assert.equal(d.motivoTexto, '');
    assert.equal(d.referencia, '');
  }
});

// ---------- efeitos ----------

test('leitura administrativa, histórico e auditoria NUNCA são barrados', () => {
  for (const estado of [...ESTADOS, 'DESCONHECIDO', undefined, null]) {
    const barradas = barradasPor(estado);
    for (const preservada of ['leitura_administrativa', 'historico_e_auditoria']) {
      assert.equal(barradas.includes(preservada), false,
        `${String(estado)} barrou ${preservada}: suspensão por fraude não pode apagar prova`);
    }
  }
});

test('suspensão barra divulgação, inscrição, pagamento e balcão', () => {
  const barradas = barradasPor('SUSPENSO');
  for (const o of ['divulgacao_publica', 'nova_inscricao', 'novo_pagamento', 'acesso_operacional']) {
    assert.ok(barradas.includes(o), `suspensão deixou passar ${o}`);
  }
  assert.equal(barradas.includes('listagem_publica'), false,
    'suspenso continua listável: a página explica a indisponibilidade em vez de desaparecer');
});

test('remoção barra tudo o que a suspensão barra, e também a listagem', () => {
  const suspenso = barradasPor('SUSPENSO');
  const removido = barradasPor('REMOVIDO');
  for (const o of suspenso) assert.ok(removido.includes(o), `remoção é mais frouxa que suspensão em ${o}`);
  assert.ok(removido.includes('listagem_publica'));
});

test('ATIVO não barra nada', () => {
  assert.deepEqual(barradasPor('ATIVO'), []);
});

test('permite() falha fechada para estado ou operação desconhecidos', () => {
  for (const estado of ['', 'ativo', undefined, null, 42, {}]) {
    assert.equal(permite(estado, 'nova_inscricao'), false, `estado ${String(estado)} liberou`);
  }
  for (const operacao of ['', 'qualquer_coisa', undefined, null, 42]) {
    assert.equal(permite('ATIVO', operacao), false, `operação ${String(operacao)} liberou`);
  }
  for (const o of OPERACOES) assert.equal(permite('ATIVO', o), true);
  assert.equal(permite('SUSPENSO', 'nova_inscricao'), false);
  assert.equal(permite('SUSPENSO', 'leitura_administrativa'), true);
});

test('o público não vê classificação, motivo nem referência', () => {
  const suspenso = apresentacaoPublica('SUSPENSO');
  assert.equal(suspenso.visivel, true);
  assert.ok(suspenso.mensagem);
  for (const proibido of [...CLASSIFICACOES, 'CASO-', 'fraude', 'Fraude', 'denúncia']) {
    assert.ok(!suspenso.mensagem.includes(proibido), `a mensagem pública contém "${proibido}"`);
  }
  assert.deepEqual(apresentacaoPublica('REMOVIDO'), { visivel: false, mensagem: null });
  assert.deepEqual(apresentacaoPublica('ATIVO'), { visivel: true, mensagem: null });
  for (const estranho of ['', undefined, null, 42]) {
    assert.deepEqual(apresentacaoPublica(estranho), { visivel: false, mensagem: null },
      'estado desconhecido não pode virar página visível');
  }
});
