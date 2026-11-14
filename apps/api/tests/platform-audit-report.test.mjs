import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
  MAX_ACOES_NO_FILTRO,
  RESULTADOS,
  dentroDoEscopo,
  montarRelatorio,
  restricaoDoEscopo,
  validarFiltroDoRelatorio,
} from '../src/platform-audit-report.ts';

const PLATAFORMA = { tipo: 'PLATAFORMA' };
const EVENTO_A = { tipo: 'EVENTO', eventId: 'evento-aaaaaaaa' };
const EVENTO_B = { tipo: 'EVENTO', eventId: 'evento-bbbbbbbb' };
const ORG_UM = { tipo: 'ORGANIZACAO', organizationId: 'org-uuuuuuuu' };

const filtroVazio = () => {
  const lido = validarFiltroDoRelatorio({});
  assert.equal(lido.ok, true);
  return lido.filtro;
};

function linha(parcial = {}) {
  return {
    actorUserId: 'autor-aaaaaaaa',
    action: 'conceder',
    scopeKind: 'EVENTO',
    organizationId: 'org-uuuuuuuu',
    eventId: 'evento-aaaaaaaa',
    targetUserId: '',
    reason: 'motivo registrado',
    result: 'ALLOWED',
    changes: null,
    correlationId: 'correlacao-11111',
    occurredAt: '2026-11-14T10:00:00.000Z',
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// O escopo vem da rota. Este bloco é a fronteira de segurança do relatório.
// ---------------------------------------------------------------------------

test('o escopo de evento não alcança a linha de outro evento', () => {
  assert.equal(dentroDoEscopo(linha({ eventId: 'evento-aaaaaaaa' }), EVENTO_A), true);
  assert.equal(dentroDoEscopo(linha({ eventId: 'evento-bbbbbbbb' }), EVENTO_A), false);
});

test('o escopo de evento não alcança linha sem evento, mesmo da mesma organização', () => {
  // Ação de alcance global: gravada sem eventId. Um auditor de evento não a vê.
  const global = linha({ eventId: '', scopeKind: 'GLOBAL', action: 'conceder' });
  assert.equal(dentroDoEscopo(global, EVENTO_A), false);
  assert.equal(dentroDoEscopo(global, ORG_UM), true);
  assert.equal(dentroDoEscopo(global, PLATAFORMA), true);
});

test('o escopo de organização não alcança linha de outra organização', () => {
  assert.equal(dentroDoEscopo(linha({ organizationId: 'org-uuuuuuuu' }), ORG_UM), true);
  assert.equal(dentroDoEscopo(linha({ organizationId: 'org-zzzzzzzz' }), ORG_UM), false);
});

test('escopo de organização com coluna vazia não vira coringa', () => {
  // Se a comparação fosse só de igualdade, '' === '' daria verdadeiro para
  // um escopo de organização vazia. A guarda de comprimento impede.
  const semOrg = linha({ organizationId: '' });
  assert.equal(dentroDoEscopo(semOrg, { tipo: 'ORGANIZACAO', organizationId: '' }), false);
  const semEvento = linha({ eventId: '' });
  assert.equal(dentroDoEscopo(semEvento, { tipo: 'EVENTO', eventId: '' }), false);
});

test('a plataforma alcança qualquer linha', () => {
  assert.equal(dentroDoEscopo(linha({ eventId: '', organizationId: '' }), PLATAFORMA), true);
});

test('a restrição do banco espelha o escopo e nada mais', () => {
  assert.deepEqual(restricaoDoEscopo(PLATAFORMA), {});
  assert.deepEqual(restricaoDoEscopo(EVENTO_A), { eventId: 'evento-aaaaaaaa' });
  assert.deepEqual(restricaoDoEscopo(ORG_UM), { organizationId: 'org-uuuuuuuu' });
});

test('o relatório aplica o escopo mesmo quando a consulta trouxe linha de fora', () => {
  // Duas camadas: se um dia alguém esquecer o WHERE, a linha não entra.
  const linhas = [linha({ eventId: 'evento-aaaaaaaa' }), linha({ eventId: 'evento-bbbbbbbb' })];
  const relatorio = montarRelatorio(linhas, EVENTO_A, filtroVazio());
  assert.equal(relatorio.mostrados, 1);
  assert.equal(relatorio.itens[0].eventId, 'evento-aaaaaaaa');
});

// ---------------------------------------------------------------------------
// O filtro vem do corpo e só estreita.
// ---------------------------------------------------------------------------

test('o corpo não carrega escopo: campos de escopo no corpo são ignorados', () => {
  const lido = validarFiltroDoRelatorio({ eventId: 'evento-bbbbbbbb', organizationId: 'org-zzzzzzzz', escopo: 'PLATAFORMA' });
  assert.equal(lido.ok, true);
  assert.equal('eventId' in lido.filtro, false);
  assert.equal('organizationId' in lido.filtro, false);
  assert.equal('escopo' in lido.filtro, false);
});

test('o escopo da rota vence o que o corpo tentar dizer', () => {
  const lido = validarFiltroDoRelatorio({ eventId: 'evento-bbbbbbbb' });
  assert.equal(lido.ok, true);
  const relatorio = montarRelatorio([linha({ eventId: 'evento-bbbbbbbb' })], EVENTO_A, lido.filtro);
  assert.equal(relatorio.mostrados, 0);
  assert.deepEqual(relatorio.escopo, EVENTO_A);
});

test('filtro vazio tem os valores neutros e o limite padrão', () => {
  const filtro = filtroVazio();
  assert.deepEqual(filtro, {
    de: null, ate: null, acoes: [], resultados: [],
    actorUserId: null, targetUserId: null, limite: LIMITE_PADRAO,
  });
});

test('corpo ausente é o mesmo que filtro vazio', () => {
  for (const corpo of [undefined, null]) {
    const lido = validarFiltroDoRelatorio(corpo);
    assert.equal(lido.ok, true);
    assert.equal(lido.filtro.limite, LIMITE_PADRAO);
  }
});

test('corpo que não é objeto é recusado', () => {
  for (const corpo of ['texto', 42, true, []]) {
    const lido = validarFiltroDoRelatorio(corpo);
    assert.equal(lido.ok, false, `aceitou ${JSON.stringify(corpo)}`);
  }
});

test('o filtro de período estreita por data', () => {
  const linhas = [
    linha({ occurredAt: '2026-11-10T10:00:00.000Z', correlationId: 'antes' }),
    linha({ occurredAt: '2026-11-14T10:00:00.000Z', correlationId: 'dentro' }),
    linha({ occurredAt: '2026-11-20T10:00:00.000Z', correlationId: 'depois' }),
  ];
  const lido = validarFiltroDoRelatorio({ de: '2026-11-12T00:00:00.000Z', ate: '2026-11-16T00:00:00.000Z' });
  assert.equal(lido.ok, true);
  const relatorio = montarRelatorio(linhas, PLATAFORMA, lido.filtro);
  assert.deepEqual(relatorio.itens.map((i) => i.correlacao), ['dentro']);
});

test('os extremos do período entram', () => {
  const linhas = [
    linha({ occurredAt: '2026-11-12T00:00:00.000Z', correlationId: 'inicio' }),
    linha({ occurredAt: '2026-11-16T00:00:00.000Z', correlationId: 'fim' }),
  ];
  const lido = validarFiltroDoRelatorio({ de: '2026-11-12T00:00:00.000Z', ate: '2026-11-16T00:00:00.000Z' });
  const relatorio = montarRelatorio(linhas, PLATAFORMA, lido.filtro);
  assert.equal(relatorio.mostrados, 2);
});

test('período invertido é recusado', () => {
  const lido = validarFiltroDoRelatorio({ de: '2026-11-16T00:00:00.000Z', ate: '2026-11-12T00:00:00.000Z' });
  assert.equal(lido.ok, false);
  assert.equal(lido.erros.some((e) => e.includes('posterior')), true);
});

test('data ilegível é recusada', () => {
  for (const valor of ['ontem', '2026-13-45', 42, {}]) {
    const lido = validarFiltroDoRelatorio({ de: valor });
    assert.equal(lido.ok, false, `aceitou ${JSON.stringify(valor)}`);
  }
});

test('o filtro de ação estreita e aceita o motivo da recusa na própria ação', () => {
  const linhas = [
    linha({ action: 'conceder' }),
    linha({ action: 'revogar' }),
    linha({ action: 'consultar:SEM_CONCESSAO', result: 'DENIED' }),
  ];
  const lido = validarFiltroDoRelatorio({ acoes: ['revogar', 'consultar:SEM_CONCESSAO'] });
  assert.equal(lido.ok, true);
  const relatorio = montarRelatorio(linhas, PLATAFORMA, lido.filtro);
  assert.deepEqual(relatorio.itens.map((i) => i.acao).sort(), ['consultar:SEM_CONCESSAO', 'revogar']);
});

test('ação inválida no filtro é recusada', () => {
  for (const valor of ['CONCEDER', 'co', 'conceder;drop', 'conceder:minusculo', 'acao_000', 42]) {
    const lido = validarFiltroDoRelatorio({ acoes: [valor] });
    assert.equal(lido.ok, false, `aceitou ${JSON.stringify(valor)}`);
  }
});

test('ações repetidas no filtro não repetem', () => {
  const lido = validarFiltroDoRelatorio({ acoes: ['conceder', 'conceder', 'revogar'] });
  assert.equal(lido.ok, true);
  assert.deepEqual(lido.filtro.acoes, ['conceder', 'revogar']);
});

test('mais ações que o máximo é recusado, e o máximo exato passa', () => {
  const nomes = ['conceder', 'revogar', 'auditar', 'consultar', 'suspender', 'restaurar', 'publicar', 'encerrar',
    'arquivar', 'duplicar', 'exportar', 'importar', 'promover', 'rebaixar', 'convidar', 'remover',
    'aprovar', 'recusar', 'bloquear', 'liberar', 'migrar'];
  assert.equal(nomes.length, MAX_ACOES_NO_FILTRO + 1);
  assert.equal(validarFiltroDoRelatorio({ acoes: nomes.slice(0, MAX_ACOES_NO_FILTRO) }).ok, true);
  assert.equal(validarFiltroDoRelatorio({ acoes: nomes }).ok, false);
});

test('o filtro de resultado estreita, e o relatório não esconde recusa por padrão', () => {
  const linhas = [
    linha({ result: 'ALLOWED' }),
    linha({ result: 'DENIED' }),
    linha({ result: 'FAILED' }),
  ];
  const tudo = montarRelatorio(linhas, PLATAFORMA, filtroVazio());
  assert.equal(tudo.mostrados, 3);

  const lido = validarFiltroDoRelatorio({ resultados: ['DENIED', 'FAILED'] });
  assert.equal(lido.ok, true);
  const recusas = montarRelatorio(linhas, PLATAFORMA, lido.filtro);
  assert.deepEqual(recusas.itens.map((i) => i.resultado).sort(), ['DENIED', 'FAILED']);
});

test('o catálogo de resultados é exatamente o do schema', () => {
  assert.deepEqual([...RESULTADOS], ['ALLOWED', 'DENIED', 'FAILED']);
  assert.equal(validarFiltroDoRelatorio({ resultados: ['PENDENTE'] }).ok, false);
});

test('o filtro de autor estreita', () => {
  const linhas = [linha({ actorUserId: 'autor-aaaaaaaa' }), linha({ actorUserId: 'autor-bbbbbbbb' })];
  const lido = validarFiltroDoRelatorio({ actorUserId: 'autor-bbbbbbbb' });
  const relatorio = montarRelatorio(linhas, PLATAFORMA, lido.filtro);
  assert.deepEqual(relatorio.itens.map((i) => i.autor), ['autor-bbbbbbbb']);
});

// Nasceu da mutação `alvo-ignorado`: trocar a comparação de alvo por `false`
// sobrevivia, porque nenhum teste exercia o estreitamento por alvo.
test('o filtro de alvo estreita', () => {
  const linhas = [
    linha({ targetUserId: 'alvo-aaaaaaaa', correlationId: 'um' }),
    linha({ targetUserId: 'alvo-bbbbbbbb', correlationId: 'dois' }),
    linha({ targetUserId: '', correlationId: 'sem-alvo' }),
  ];
  const lido = validarFiltroDoRelatorio({ targetUserId: 'alvo-bbbbbbbb' });
  assert.equal(lido.ok, true);
  const relatorio = montarRelatorio(linhas, PLATAFORMA, lido.filtro);
  assert.deepEqual(relatorio.itens.map((i) => i.correlacao), ['dois']);
});

test('identificador malformado no filtro é recusado', () => {
  for (const campo of ['actorUserId', 'targetUserId']) {
    assert.equal(validarFiltroDoRelatorio({ [campo]: 'curto' }).ok, false, campo);
    assert.equal(validarFiltroDoRelatorio({ [campo]: 'com espaco aqui' }).ok, false, campo);
    assert.equal(validarFiltroDoRelatorio({ [campo]: 'a'.repeat(65) }).ok, false, campo);
    assert.equal(validarFiltroDoRelatorio({ [campo]: '' }).ok, true, `${campo} vazio é ausência`);
  }
});

test('todos os problemas do filtro voltam de uma vez', () => {
  const lido = validarFiltroDoRelatorio({ de: 'ontem', acoes: ['INVALIDA'], resultados: ['NAO_EXISTE'], limite: 0 });
  assert.equal(lido.ok, false);
  assert.equal(lido.erros.length >= 4, true, `voltaram ${lido.erros.length} erros`);
});

// ---------------------------------------------------------------------------
// Limite, truncamento e agregados.
// ---------------------------------------------------------------------------

test('o limite é validado nas duas pontas', () => {
  assert.equal(validarFiltroDoRelatorio({ limite: 1 }).ok, true);
  assert.equal(validarFiltroDoRelatorio({ limite: LIMITE_MAXIMO }).ok, true);
  assert.equal(validarFiltroDoRelatorio({ limite: 0 }).ok, false);
  assert.equal(validarFiltroDoRelatorio({ limite: -5 }).ok, false);
  assert.equal(validarFiltroDoRelatorio({ limite: LIMITE_MAXIMO + 1 }).ok, false);
  assert.equal(validarFiltroDoRelatorio({ limite: 10.5 }).ok, false);
  assert.equal(validarFiltroDoRelatorio({ limite: '10' }).ok, false);
});

// Teste de dados, não de código: evita que alguém inverta as constantes.
test('o limite padrão é menor que o máximo', () => {
  assert.equal(LIMITE_PADRAO < LIMITE_MAXIMO, true);
  assert.equal(LIMITE_PADRAO >= 1, true);
});

test('truncamento nunca é silencioso', () => {
  const linhas = Array.from({ length: 5 }, (_, i) =>
    linha({ correlationId: `c${i}`, occurredAt: new Date(Date.UTC(2026, 10, 14, 10, i)).toISOString() }));
  const lido = validarFiltroDoRelatorio({ limite: 3 });
  const relatorio = montarRelatorio(linhas, PLATAFORMA, lido.filtro);
  assert.equal(relatorio.mostrados, 3);
  assert.equal(relatorio.truncado, true);
  assert.equal(relatorio.agregadosSobre, 'pagina');
});

test('sem truncamento, os agregados são sobre tudo', () => {
  const relatorio = montarRelatorio([linha()], PLATAFORMA, filtroVazio());
  assert.equal(relatorio.truncado, false);
  assert.equal(relatorio.agregadosSobre, 'tudo');
});

test('o limite exato não marca truncado', () => {
  const linhas = Array.from({ length: 3 }, (_, i) => linha({ correlationId: `c${i}` }));
  const relatorio = montarRelatorio(linhas, PLATAFORMA, validarFiltroDoRelatorio({ limite: 3 }).filtro);
  assert.equal(relatorio.mostrados, 3);
  assert.equal(relatorio.truncado, false);
});

test('mais recente primeiro', () => {
  const linhas = [
    linha({ correlationId: 'velho', occurredAt: '2026-11-10T10:00:00.000Z' }),
    linha({ correlationId: 'novo', occurredAt: '2026-11-14T10:00:00.000Z' }),
    linha({ correlationId: 'meio', occurredAt: '2026-11-12T10:00:00.000Z' }),
  ];
  const relatorio = montarRelatorio(linhas, PLATAFORMA, filtroVazio());
  assert.deepEqual(relatorio.itens.map((i) => i.correlacao), ['novo', 'meio', 'velho']);
});

test('truncar corta as mais antigas, nunca as mais recentes', () => {
  const linhas = [
    linha({ correlationId: 'velho', occurredAt: '2026-11-10T10:00:00.000Z' }),
    linha({ correlationId: 'novo', occurredAt: '2026-11-14T10:00:00.000Z' }),
  ];
  const relatorio = montarRelatorio(linhas, PLATAFORMA, validarFiltroDoRelatorio({ limite: 1 }).filtro);
  assert.deepEqual(relatorio.itens.map((i) => i.correlacao), ['novo']);
});

test('os agregados contam o que está na página', () => {
  const linhas = [
    linha({ action: 'conceder', result: 'ALLOWED' }),
    linha({ action: 'conceder', result: 'DENIED' }),
    linha({ action: 'revogar', result: 'ALLOWED' }),
    linha({ action: 'auditar', result: 'FAILED' }),
  ];
  const relatorio = montarRelatorio(linhas, PLATAFORMA, filtroVazio());
  assert.deepEqual(relatorio.porResultado, { ALLOWED: 2, DENIED: 1, FAILED: 1 });
  assert.deepEqual(relatorio.porAcao, [
    { chave: 'conceder', total: 2 },
    { chave: 'auditar', total: 1 },
    { chave: 'revogar', total: 1 },
  ]);
});

test('resultado sem nenhuma ocorrência aparece como zero, não ausente', () => {
  const relatorio = montarRelatorio([linha({ result: 'ALLOWED' })], PLATAFORMA, filtroVazio());
  assert.deepEqual(relatorio.porResultado, { ALLOWED: 1, DENIED: 0, FAILED: 0 });
});

test('relatório vazio é vazio, não erro', () => {
  const relatorio = montarRelatorio([], EVENTO_B, filtroVazio());
  assert.equal(relatorio.mostrados, 0);
  assert.equal(relatorio.truncado, false);
  assert.deepEqual(relatorio.itens, []);
  assert.deepEqual(relatorio.porAcao, []);
  assert.deepEqual(relatorio.porResultado, { ALLOWED: 0, DENIED: 0, FAILED: 0 });
});

// ---------------------------------------------------------------------------
// A forma do item.
// ---------------------------------------------------------------------------

test('a sentinela de coluna vazia vira ausência, não string vazia', () => {
  const relatorio = montarRelatorio([linha({ targetUserId: '', eventId: '', organizationId: '' })], PLATAFORMA, filtroVazio());
  const item = relatorio.itens[0];
  assert.equal(item.alvo, null);
  assert.equal(item.eventId, null);
  assert.equal(item.organizationId, null);
});

// Nasceu da mutação `alteracoes-undefined`: todos os casos passavam `null`
// explícito, então `?? null` podia cair sem ninguém notar.
test('alterações ausentes aparecem como nulo, e a chave nunca falta', () => {
  const semChave = montarRelatorio([linha({ changes: undefined })], PLATAFORMA, filtroVazio());
  assert.equal('alteracoes' in semChave.itens[0], true, 'chave ausente é ambígua para quem lê');
  assert.equal(semChave.itens[0].alteracoes, null);

  const comValor = montarRelatorio([linha({ changes: { de: 'A', para: 'B' } })], PLATAFORMA, filtroVazio());
  assert.deepEqual(comValor.itens[0].alteracoes, { de: 'A', para: 'B' });
});

test('a data do item sai normalizada em ISO', () => {
  const comData = montarRelatorio([linha({ occurredAt: new Date('2026-11-14T10:00:00.000Z') })], PLATAFORMA, filtroVazio());
  assert.equal(comData.itens[0].quando, '2026-11-14T10:00:00.000Z');
  const comTexto = montarRelatorio([linha({ occurredAt: '2026-11-14T07:00:00-03:00' })], PLATAFORMA, filtroVazio());
  assert.equal(comTexto.itens[0].quando, '2026-11-14T10:00:00.000Z');
});

test('o motivo e a correlação chegam inteiros a quem audita', () => {
  const relatorio = montarRelatorio([linha({ reason: 'suspeita de uso indevido', correlationId: 'corr-123456789' })], PLATAFORMA, filtroVazio());
  assert.equal(relatorio.itens[0].motivo, 'suspeita de uso indevido');
  assert.equal(relatorio.itens[0].correlacao, 'corr-123456789');
});

test('o escopo volta no relatório, para quem lê saber o alcance do que viu', () => {
  const relatorio = montarRelatorio([linha()], EVENTO_A, filtroVazio());
  assert.deepEqual(relatorio.escopo, EVENTO_A);
});
