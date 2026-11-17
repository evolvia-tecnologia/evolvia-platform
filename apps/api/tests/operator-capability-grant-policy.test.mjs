import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogoParaInterface,
  decidirGestaoDeConcessao,
  mensagemDaRecusa,
} from '../src/operator-capability-grant-policy.ts';
import { ACOES_DE_OPERADOR, LIMITE_DO_MOTIVO, METODOS_SO_DE_ORGANIZADOR, PERFIS_DE_OPERADOR, acoesDoPerfil } from '../src/operator-capability-policy.ts';

const ORGANIZADORES = ['OWNER', 'ADMIN', 'MANAGER'];
const alvo = (over = {}) => ({ userId: 'usr-2', papel: 'OPERATOR', ativo: true, ...over });
const pedido = (over = {}) => ({
  papelDoAtor: 'MANAGER',
  atorUserId: 'usr-1',
  alvo: alvo(),
  motivo: 'turno da manha no credenciamento',
  acoes: ['checkin'],
  ...over,
});

// ---------------------------------------------------------------------------
// 1. Quem pode mexer
// ---------------------------------------------------------------------------

test('os três papéis de organizador podem conceder', () => {
  for (const papelDoAtor of ORGANIZADORES) {
    const v = decidirGestaoDeConcessao(pedido({ papelDoAtor }));
    assert.equal(v.permitido, true, papelDoAtor);
    assert.deepEqual(v.acoes, ['checkin']);
    assert.equal(v.justificativa, 'turno da manha no credenciamento');
  }
});

test('operador e espectador não concedem a ninguém, nem com tudo mais correto', () => {
  for (const papelDoAtor of ['OPERATOR', 'VIEWER']) {
    const v = decidirGestaoDeConcessao(pedido({ papelDoAtor }));
    assert.equal(v.permitido, false, papelDoAtor);
    assert.equal(v.motivo, 'ator_nao_e_organizador');
    assert.deepEqual(v.acoes, []);
  }
});

// ---------------------------------------------------------------------------
// 2. Sobre quem
// ---------------------------------------------------------------------------

test('alvo que não é membro é recusado', () => {
  const v = decidirGestaoDeConcessao(pedido({ alvo: null }));
  assert.equal(v.permitido, false);
  assert.equal(v.motivo, 'alvo_inexistente');
});

test('alvo suspenso ou removido não recebe permissão nova', () => {
  const v = decidirGestaoDeConcessao(pedido({ alvo: alvo({ ativo: false }) }));
  assert.equal(v.permitido, false);
  assert.equal(v.motivo, 'alvo_nao_e_membro_ativo');
});

test('só OPERATOR recebe concessão: organizador já passa, VIEWER nunca passa', () => {
  for (const papel of ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER']) {
    const v = decidirGestaoDeConcessao(pedido({ alvo: alvo({ papel }) }));
    assert.equal(v.permitido, false, papel);
    assert.equal(v.motivo, 'alvo_nao_e_operador', papel);
  }
});

test('SEPARAÇÃO DE FUNÇÕES: o ator nunca pode ser o próprio alvo', () => {
  // decorre das duas regras: ator tem de ser organizador, alvo tem de ser OPERATOR
  for (const papelDoAtor of [...ORGANIZADORES, 'OPERATOR', 'VIEWER']) {
    const v = decidirGestaoDeConcessao(
      pedido({ papelDoAtor, atorUserId: 'usr-1', alvo: alvo({ userId: 'usr-1', papel: papelDoAtor }) }),
    );
    assert.equal(v.permitido, false, `${papelDoAtor} concedeu a si mesmo`);
  }
});

// ---------------------------------------------------------------------------
// 3. Motivo, que e o que faz o historico responder "por que"
// ---------------------------------------------------------------------------

test('motivo ausente, vazio ou só espaço é recusado', () => {
  for (const motivo of [undefined, null, '', '   ', '\n\t', 42, {}]) {
    const v = decidirGestaoDeConcessao(pedido({ motivo }));
    assert.equal(v.permitido, false, JSON.stringify(motivo));
    assert.equal(v.motivo, 'motivo_obrigatorio');
  }
});

test('motivo é aparado, e acima do limite é recusado', () => {
  assert.equal(decidirGestaoDeConcessao(pedido({ motivo: '  turno  ' })).justificativa, 'turno');
  assert.equal(decidirGestaoDeConcessao(pedido({ motivo: 'x'.repeat(LIMITE_DO_MOTIVO) })).permitido, true);
  const v = decidirGestaoDeConcessao(pedido({ motivo: 'x'.repeat(LIMITE_DO_MOTIVO + 1) }));
  assert.equal(v.permitido, false);
  assert.equal(v.motivo, 'motivo_muito_longo');
});

// ---------------------------------------------------------------------------
// 4. O que se concede
// ---------------------------------------------------------------------------

test('ação inexistente é recusada', () => {
  for (const ruim of [['voar'], ['checkin', 'voar'], [null], [42]]) {
    const v = decidirGestaoDeConcessao(pedido({ acoes: ruim }));
    assert.equal(v.permitido, false, JSON.stringify(ruim));
    assert.equal(v.motivo, 'acao_invalida');
  }
});

test('ação exclusiva de organizador é recusada com motivo próprio, não como inválida', () => {
  for (const metodo of METODOS_SO_DE_ORGANIZADOR) {
    const v = decidirGestaoDeConcessao(pedido({ acoes: [metodo] }));
    assert.equal(v.permitido, false, metodo);
    assert.equal(v.motivo, 'acao_exclusiva_de_organizador', metodo);
  }
});

test('lista vazia e lista ausente são recusadas', () => {
  assert.equal(decidirGestaoDeConcessao(pedido({ acoes: [] })).motivo, 'pedido_sem_acoes');
  const semNada = { ...pedido() };
  delete semNada.acoes;
  assert.equal(decidirGestaoDeConcessao(semNada).motivo, 'pedido_sem_acoes');
});

test('duplicatas são reduzidas a uma', () => {
  const v = decidirGestaoDeConcessao(pedido({ acoes: ['checkin', 'checkin', 'relatorio'] }));
  assert.deepEqual(v.acoes, ['checkin', 'relatorio']);
});

// ---------------------------------------------------------------------------
// 5. Perfis predefinidos
// ---------------------------------------------------------------------------

test('todo perfil predefinido é aceito e expande nas ações dele', () => {
  for (const nome of Object.keys(PERFIS_DE_OPERADOR)) {
    const p = { ...pedido(), perfil: nome };
    delete p.acoes;
    const v = decidirGestaoDeConcessao(p);
    assert.equal(v.permitido, true, nome);
    assert.deepEqual([...v.acoes], acoesDoPerfil(nome), nome);
  }
});

test('perfil inexistente é recusado', () => {
  const p = { ...pedido(), perfil: 'deus' };
  delete p.acoes;
  assert.equal(decidirGestaoDeConcessao(p).motivo, 'perfil_invalido');
});

test('perfil e ações ao mesmo tempo é recusado, para não haver dúvida do que foi concedido', () => {
  const v = decidirGestaoDeConcessao(pedido({ perfil: 'credenciamento', acoes: ['relatorio'] }));
  assert.equal(v.permitido, false);
  assert.equal(v.motivo, 'acoes_e_perfil_ao_mesmo_tempo');
});

// ---------------------------------------------------------------------------
// 6. Mensagens e catalogo para a interface
// ---------------------------------------------------------------------------

test('todo motivo de recusa tem mensagem em português, sem id e sem nome', () => {
  const motivos = new Set();
  // colhe todos os motivos que o modulo realmente produz
  const cenarios = [
    pedido({ papelDoAtor: 'OPERATOR' }),
    pedido({ alvo: null }),
    pedido({ alvo: alvo({ ativo: false }) }),
    pedido({ alvo: alvo({ papel: 'OWNER' }) }),
    pedido({ motivo: '' }),
    pedido({ motivo: 'x'.repeat(LIMITE_DO_MOTIVO + 1) }),
    pedido({ acoes: ['voar'] }),
    pedido({ acoes: ['updateLabel'] }),
    pedido({ acoes: [] }),
    pedido({ perfil: 'deus', acoes: undefined }),
    pedido({ perfil: 'credenciamento' }),
  ];
  for (const c of cenarios) {
    const v = decidirGestaoDeConcessao(c);
    if (v.motivo) motivos.add(v.motivo);
  }
  assert.equal(motivos.size, 11, [...motivos].join(','));
  for (const m of motivos) {
    const texto = mensagemDaRecusa(m);
    assert.equal(typeof texto, 'string', m);
    assert.ok(texto.length > 10, m);
    assert.doesNotMatch(texto, /usr-|org-|evt-/u, `${m}: mensagem com id`);
  }
});

test('o catálogo da interface cobre o catálogo de ações, marcando as sensíveis', () => {
  const catalogo = catalogoParaInterface();
  assert.equal(catalogo.length, Object.keys(ACOES_DE_OPERADOR).length);
  assert.equal(catalogo.filter((c) => c.sensivel).length, 5);
  for (const linha of catalogo) {
    assert.equal(linha.sensivel, ACOES_DE_OPERADOR[linha.acao].sensivel, linha.acao);
    assert.equal(linha.capacidade, ACOES_DE_OPERADOR[linha.acao].capacidade, linha.acao);
  }
});
