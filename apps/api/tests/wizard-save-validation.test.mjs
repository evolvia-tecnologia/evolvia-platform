import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agendaResultante,
  getAgendaSaveIssues,
  getWizardSaveIssues,
  subjectAreasToPersist,
} from '../src/wizard-save-policy.ts';

/**
 * Defeitos da auditoria do organizador (#640, contrato #661), cada um com o
 * teste que o REPROVA antes da correção.
 *
 * C-01: a ordem das datas só era exigida em `complete()`; `save()` gravava o
 *       intervalo invertido e respondia 200.
 * C-02: `persistEventData` escrevia `subjectAreas` sem guarda, então um
 *       salvamento parcial apagava as áreas.
 * C-04: a correção de C-01 validava o CORPO. Um PATCH com apenas o término,
 *       anterior ao início já gravado, continuava persistindo o intervalo
 *       invertido com 200 — porque `persistEventData` escreve o término e nem
 *       inclui o início no update, deixando o antigo no lugar.
 *
 * O arquivo importa `wizard-save-policy.ts`, que não tem dependência nenhuma, e
 * por isso roda com `--experimental-strip-types` sem build. A tentativa
 * anterior importava `wizard-policy.ts` e reprovou no CI: aquele módulo importa
 * `./event-publication/public-discovery.policy` sem extensão, e o Node não
 * resolve import relativo extensionless nesse modo.
 *
 * Sobre a nota que estava aqui antes, dizendo que a divergência "deixou de ser
 * possível por construção" porque `getWizardCompletionIssues` passou a chamar
 * `getWizardSaveIssues`: aquilo valia para save-vs-complete e só. A divergência
 * que produziu C-04 era outra — entre a VALIDAÇÃO e a ESCRITA, que montava o
 * resultado por conta própria dentro das suas guardas. É essa que
 * `agendaResultante` fecha, e o teste do espelho abaixo é o que a mantém
 * fechada.
 */

const ERRO = 'A data de término não pode ser anterior à data de início.';
const dia = (n) => `2026-12-${String(n).padStart(2, '0')}T12:00:00.000Z`;
const gravado = { startDate: new Date(dia(10)), endDate: new Date(dia(12)) };
const instante = (valor) => (valor == null ? null : new Date(valor).getTime());

// --------------------------------------------------------------------- C-01
test('salvar com término anterior ao início é recusado', () => {
  assert.deepEqual(getWizardSaveIssues({ startDate: dia(10), endDate: dia(1) }), [ERRO]);
});
test('evento de um único instante é legítimo', () => {
  assert.deepEqual(getWizardSaveIssues({ startDate: dia(10), endDate: dia(10) }), []);
});
test('rascunho com uma data só continua podendo ser salvo', () => {
  for (const p of [{ startDate: dia(10) }, { endDate: dia(1) }, {}, { startDate: null, endDate: null }, { startDate: dia(10), endDate: null }]) {
    assert.deepEqual(getWizardSaveIssues(p), [], JSON.stringify(p));
  }
});
test('a comparação é por instante, não por texto do mesmo dia', () => {
  assert.deepEqual(getWizardSaveIssues({ startDate: '2026-12-02T03:00:00.000Z', endDate: '2026-12-02T01:00:00.000Z' }), [ERRO]);
});

// --------------------------------------------------------------------- C-04
test('corpo com SÓ o término, anterior ao início gravado, é recusado', () => {
  const pedido = { endDate: dia(1) };
  assert.deepEqual(getWizardSaveIssues(pedido), [], 'validar o corpo deixava passar: é este o defeito');
  assert.deepEqual(getAgendaSaveIssues(agendaResultante(pedido, gravado)), [ERRO]);
});

test('corpo com SÓ o início, posterior ao término gravado, é recusado', () => {
  const pedido = { startDate: dia(20) };
  assert.deepEqual(getWizardSaveIssues(pedido), [], 'o outro sentido também passava');
  assert.deepEqual(getAgendaSaveIssues(agendaResultante(pedido, gravado)), [ERRO]);
});

test('prorrogação válida passa e não reescreve o início gravado', () => {
  const agenda = agendaResultante({ endDate: dia(20) }, gravado);
  assert.deepEqual(getAgendaSaveIssues(agenda), []);
  assert.equal(agenda.gravaEndDate, true);
  assert.equal(agenda.gravaStartDate, false, 'o campo não pedido não entra no update');
  assert.equal(agenda.startDate, gravado.startDate, 'devolve a mesma referência, não um ISO reconstruído');
});

test('antecipar o início para antes do término gravado passa', () => {
  assert.deepEqual(getAgendaSaveIssues(agendaResultante({ startDate: dia(1) }, gravado)), []);
});

test('o resultado é comparado por instante, inclusive na fronteira', () => {
  assert.deepEqual(getAgendaSaveIssues(agendaResultante({ endDate: dia(10) }, gravado)), [], 'início == término é legítimo');
  const umMsAntes = new Date(new Date(dia(10)).getTime() - 1).toISOString();
  assert.deepEqual(getAgendaSaveIssues(agendaResultante({ endDate: umMsAntes }, gravado)), [ERRO]);
});

test('datesPending limpa as duas datas e não acusa inversão', () => {
  const agenda = agendaResultante({ datesPending: true }, gravado);
  assert.deepEqual([agenda.startDate, agenda.endDate], [null, null]);
  assert.deepEqual([agenda.gravaStartDate, agenda.gravaEndDate], [true, true]);
  assert.deepEqual(getAgendaSaveIssues(agenda), []);
});

test('datesPending com término no corpo limpa só o início', () => {
  const agenda = agendaResultante({ datesPending: true, endDate: dia(12) }, gravado);
  assert.equal(agenda.startDate, null);
  assert.equal(agenda.endDate, dia(12));
  assert.deepEqual(getAgendaSaveIssues(agenda), [], 'término sem início não é intervalo comparável');
});

// Evento gravado antes da correção pode ter intervalo invertido no banco.
// Cobrar o intervalo em TODO salvamento deixaria esse organizador sem
// conseguir nem corrigir o nome — e travar a tela não é preservar dado.
test('salvamento que não toca em data passa mesmo com intervalo legado invertido', () => {
  const legado = { startDate: new Date(dia(12)), endDate: new Date(dia(10)) };
  const agenda = agendaResultante({ name: 'só o nome' }, legado);
  assert.deepEqual(getAgendaSaveIssues(agenda), [], 'não travar quem não mexeu em data');
  assert.deepEqual(getWizardSaveIssues(agenda), [ERRO], 'mas concluir continua barrando o mesmo evento');
});

test('tocar em uma data de evento legado invertido obriga a corrigir o intervalo', () => {
  const legado = { startDate: new Date(dia(12)), endDate: new Date(dia(10)) };
  assert.deepEqual(getAgendaSaveIssues(agendaResultante({ endDate: dia(10) }, legado)), [ERRO]);
  assert.deepEqual(getAgendaSaveIssues(agendaResultante({ endDate: dia(25) }, legado)), []);
});

test('evento sem datas gravadas e corpo sem datas não inventa valor', () => {
  const agenda = agendaResultante({}, null);
  assert.deepEqual([agenda.startDate, agenda.endDate], [null, null]);
  assert.deepEqual([agenda.gravaStartDate, agenda.gravaEndDate], [false, false]);
});

/**
 * O teste que mantém a correção honesta.
 *
 * `agendaResultante` só vale se for o espelho EXATO das guardas de
 * `persistEventData`. A referência abaixo é a semântica de escrita anterior,
 * transcrita daquele método; se as duas divergirem, a validação volta a julgar
 * um resultado que não é o que se grava — que é o defeito C-04 de novo.
 */
test('a correção não muda o que se grava, em toda a matriz de entradas', () => {
  const escritaLegada = (pedido, atual) => {
    const data = {};
    if (pedido.startDate || pedido.datesPending) data.startDate = pedido.startDate ? new Date(pedido.startDate) : null;
    if (pedido.endDate || pedido.datesPending) data.endDate = pedido.endDate ? new Date(pedido.endDate) : null;
    return {
      gravaStartDate: 'startDate' in data,
      gravaEndDate: 'endDate' in data,
      startDate: 'startDate' in data ? data.startDate : (atual.startDate ?? null),
      endDate: 'endDate' in data ? data.endDate : (atual.endDate ?? null),
    };
  };
  const escritaNova = (pedido, atual) => {
    const agenda = agendaResultante(pedido, atual);
    const data = {};
    if (agenda.gravaStartDate) data.startDate = agenda.startDate ? new Date(agenda.startDate) : null;
    if (agenda.gravaEndDate) data.endDate = agenda.endDate ? new Date(agenda.endDate) : null;
    return {
      gravaStartDate: 'startDate' in data,
      gravaEndDate: 'endDate' in data,
      startDate: 'startDate' in data ? data.startDate : (atual.startDate ?? null),
      endDate: 'endDate' in data ? data.endDate : (atual.endDate ?? null),
    };
  };

  const valores = [undefined, null, '', dia(1), dia(10), dia(20)];
  const gravados = [
    { startDate: new Date(dia(10)), endDate: new Date(dia(12)) },
    { startDate: new Date(dia(10)), endDate: null },
    { startDate: null, endDate: null },
    {},
  ];
  let comparados = 0;
  for (const startDate of valores) {
    for (const endDate of valores) {
      for (const datesPending of [true, false, undefined]) {
        for (const atual of gravados) {
          const pedido = { startDate, endDate, datesPending };
          const legada = escritaLegada(pedido, atual);
          const nova = escritaNova(pedido, atual);
          const onde = JSON.stringify({ startDate, endDate, datesPending, atual });
          assert.equal(nova.gravaStartDate, legada.gravaStartDate, `grava início divergiu: ${onde}`);
          assert.equal(nova.gravaEndDate, legada.gravaEndDate, `grava término divergiu: ${onde}`);
          assert.equal(instante(nova.startDate), instante(legada.startDate), `início divergiu: ${onde}`);
          assert.equal(instante(nova.endDate), instante(legada.endDate), `término divergiu: ${onde}`);
          comparados += 1;
        }
      }
    }
  }
  assert.equal(comparados, valores.length * valores.length * 3 * gravados.length);
});

test('o que a validação lê é exatamente o que a escrita produz', () => {
  for (const pedido of [{ endDate: dia(1) }, { startDate: dia(20) }, { startDate: dia(1), endDate: dia(20) }, { datesPending: true }, {}]) {
    const agenda = agendaResultante(pedido, gravado);
    const escrito = {
      startDate: agenda.gravaStartDate ? (agenda.startDate ? new Date(agenda.startDate) : null) : gravado.startDate,
      endDate: agenda.gravaEndDate ? (agenda.endDate ? new Date(agenda.endDate) : null) : gravado.endDate,
    };
    assert.equal(instante(agenda.startDate), instante(escrito.startDate), JSON.stringify(pedido));
    assert.equal(instante(agenda.endDate), instante(escrito.endDate), JSON.stringify(pedido));
  }
});

// --------------------------------------------------------------------- C-02
test('corpo sem áreas preserva as gravadas', () => {
  for (const pedido of [undefined, [], null]) {
    assert.deepEqual(subjectAreasToPersist(pedido, ['saude', 'tecnologia']), ['saude', 'tecnologia'], String(pedido));
  }
});
test('corpo com áreas substitui as gravadas', () => {
  assert.deepEqual(subjectAreasToPersist(['educacao'], ['saude']), ['educacao']);
});

// A falha de CI 42706235716: `current is not iterable`. O chamador passava um
// Event sem `subjectAreas`. No banco o campo tem `@default([])` e nunca vem
// ausente, mas estourar por isso trocaria defeito de dado por indisponibilidade.
test('current ausente ou nulo não estoura, e significa vazio', () => {
  for (const atual of [undefined, null]) {
    assert.deepEqual(subjectAreasToPersist(undefined, atual), [], `current=${String(atual)}`);
    assert.deepEqual(subjectAreasToPersist(['educacao'], atual), ['educacao'], `current=${String(atual)}`);
  }
});

test('sem nada gravado e sem nada pedido, continua vazio', () => {
  assert.deepEqual(subjectAreasToPersist(undefined, []), []);
  assert.deepEqual(subjectAreasToPersist([], []), []);
});
test('o resultado é cópia: mexer nele não altera o que veio do banco', () => {
  const atual = ['saude'];
  const resultado = subjectAreasToPersist(undefined, atual);
  resultado.push('tecnologia');
  assert.deepEqual(atual, ['saude']);
});
