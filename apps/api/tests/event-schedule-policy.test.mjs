import assert from 'node:assert/strict';
import test from 'node:test';
import { planejarAlteracaoDeAgenda } from '../src/event-schedule-policy.ts';
import { getWizardSaveIssues } from '../src/wizard-save-policy.ts';

/**
 * C-05 — alteração delimitada de agenda em evento PUBLICADO (contrato #661).
 *
 * Os dois módulos importados aqui não têm dependência nenhuma, de propósito:
 * `--experimental-strip-types` não resolve import relativo extensionless, e já
 * perdemos um ciclo de CI por causa disso.
 *
 * Os casos de abuso são explícitos: tipo errado não é coagido, fuso de
 * deslocamento fixo não passa, campo obrigatório não some, e nenhum pedido
 * inválido produz sucesso falso.
 */

const D = (s) => new Date(s);
const base = {
  startDate: D('2026-12-10T12:00:00.000Z'),
  endDate: D('2026-12-12T12:00:00.000Z'),
  timeZone: 'America/Sao_Paulo',
  venue: 'Centro de Convenções',
  format: 'IN_PERSON',
};
const motivo = 'Prorrogação pedida pelo cliente';
const erros = (r) => (r.ok ? [] : r.erros);

// --- ausente mantém -------------------------------------------------------
test('campo ausente mantém o valor atual', () => {
  const r = planejarAlteracaoDeAgenda(base, { endDate: '2026-12-15T12:00:00.000Z', motivo });
  assert.equal(r.ok, true);
  assert.equal(r.depois.startDate, base.startDate.toISOString(), 'início não foi pedido e não pode mudar');
  assert.equal(r.depois.timeZone, 'America/Sao_Paulo');
  assert.equal(r.depois.venue, 'Centro de Convenções');
  assert.deepEqual(r.alterados, ['endDate']);
});

// --- valor inválido RECUSA (C-03) ----------------------------------------
test('data inválida recusa com mensagem nomeando o campo, sem gravar', () => {
  const r = planejarAlteracaoDeAgenda(base, { endDate: '30 de fevereiro', motivo });
  assert.equal(r.ok, false);
  assert.match(erros(r)[0], /data de término/iu);
});

test('tipo errado não é coagido: número, objeto e lista recusam', () => {
  for (const lixo of [123, { quando: 'amanhã' }, ['2026-12-15'], true]) {
    const r = planejarAlteracaoDeAgenda(base, { endDate: lixo, motivo });
    assert.equal(r.ok, false, `aceitou ${JSON.stringify(lixo)}`);
  }
});

test('todos os problemas vêm de uma vez, não um por tentativa', () => {
  const r = planejarAlteracaoDeAgenda(base, {
    startDate: 'xx', endDate: 'yy', timeZone: 'Marte/Olympus', venue: '   ', motivo: '',
  });
  assert.equal(r.ok, false);
  assert.equal(erros(r).length, 5, erros(r).join(' | '));
});

// --- null por campo: legítimo onde faz sentido ---------------------------
test('limpar término é legítimo', () => {
  const r = planejarAlteracaoDeAgenda(base, { endDate: null, motivo });
  assert.equal(r.ok, true);
  assert.equal(r.depois.endDate, null);
});

test('limpar início de evento publicado é recusado', () => {
  const r = planejarAlteracaoDeAgenda(base, { startDate: null, motivo });
  assert.equal(r.ok, false);
  assert.match(erros(r)[0], /sem data de início/iu);
});

test('limpar fuso é recusado: horário exibido ficaria ambíguo', () => {
  const r = planejarAlteracaoDeAgenda(base, { timeZone: null, motivo });
  assert.equal(r.ok, false);
  assert.match(erros(r)[0], /fuso/iu);
});

test('limpar local recusa em presencial e híbrido, aceita em online', () => {
  for (const format of ['IN_PERSON', 'HYBRID']) {
    const r = planejarAlteracaoDeAgenda({ ...base, format }, { venue: null, motivo });
    assert.equal(r.ok, false, `${format} deixou o participante sem endereço`);
    assert.match(erros(r)[0], /sem local/iu);
  }
  const online = planejarAlteracaoDeAgenda({ ...base, format: 'ONLINE' }, { venue: null, motivo });
  assert.equal(online.ok, true);
  assert.equal(online.depois.venue, null);
});

test('local em branco orienta em vez de apagar calado', () => {
  const r = planejarAlteracaoDeAgenda(base, { venue: '   ', motivo });
  assert.equal(r.ok, false);
  assert.match(erros(r)[0], /em branco/iu);
});

// --- fuso: abuso --------------------------------------------------------
test('deslocamento fixo não vale como fuso', () => {
  for (const fuso of ['-03:00', '+0200', 'Etc/GMT+3']) {
    assert.equal(planejarAlteracaoDeAgenda(base, { timeZone: fuso, motivo }).ok, false, fuso);
  }
  assert.equal(planejarAlteracaoDeAgenda(base, { timeZone: 'Europe/Lisbon', motivo }).ok, true);
});

// --- motivo obrigatório: a auditoria precisa do "por quê" ----------------
test('sem motivo não altera agenda de evento publicado', () => {
  for (const m of [undefined, '', '  ', 'ok', 123]) {
    assert.equal(planejarAlteracaoDeAgenda(base, { endDate: '2026-12-15T12:00:00.000Z', motivo: m }).ok, false, String(m));
  }
});

test('motivo longo demais é recusado', () => {
  const r = planejarAlteracaoDeAgenda(base, { endDate: '2026-12-15T12:00:00.000Z', motivo: 'x'.repeat(201) });
  assert.equal(r.ok, false);
});

// --- nada mudou: não fingir sucesso --------------------------------------
test('pedido que não muda nada é recusado, não é sucesso falso', () => {
  for (const pedido of [{ motivo }, { venue: 'Centro de Convenções', motivo }]) {
    const r = planejarAlteracaoDeAgenda(base, pedido);
    assert.equal(r.ok, false, JSON.stringify(pedido));
    assert.match(erros(r)[0], /nenhuma altera/iu);
  }
});

// --- intervalo resultante, com PATCH de UMA data -------------------------
test('PATCH de uma data só é validado contra a data guardada', () => {
  // Só o término vem, e ele cai ANTES do início que já estava gravado.
  const r = planejarAlteracaoDeAgenda(base, { endDate: '2026-12-01T12:00:00.000Z', motivo });
  assert.equal(r.ok, true, 'o plano em si é coerente: quem recusa o intervalo é a regra compartilhada');
  assert.deepEqual(
    getWizardSaveIssues(r.depois),
    ['A data de término não pode ser anterior à data de início.'],
    'o intervalo resultante tem de ser avaliado com a data que já estava no banco',
  );
});

test('PATCH só do início também é validado contra o término guardado', () => {
  const r = planejarAlteracaoDeAgenda(base, { startDate: '2026-12-20T12:00:00.000Z', motivo });
  assert.equal(r.ok, true);
  assert.equal(getWizardSaveIssues(r.depois).length, 1, 'início depois do término guardado tem de reprovar');
});

test('prorrogar o término é o caso feliz e passa nas duas regras', () => {
  const r = planejarAlteracaoDeAgenda(base, { endDate: '2026-12-20T12:00:00.000Z', motivo });
  assert.equal(r.ok, true);
  assert.deepEqual(getWizardSaveIssues(r.depois), []);
  assert.deepEqual(r.alterados, ['endDate']);
  assert.equal(r.antes.endDate, '2026-12-12T12:00:00.000Z', 'o antes precisa ir para a auditoria');
});

// O mutante que sobreviveu expôs um caso que eu não tinha decidido: campo
// explicitamente `undefined`. Cliente em JavaScript manda isso sem querer ao
// espalhar um formulário. Tratar como erro seria 400 incompreensível para
// quem não mexeu no campo; tratar como ausente é o que não surpreende.
test('campo explicitamente undefined é ausente, não erro', () => {
  const r = planejarAlteracaoDeAgenda(base, {
    startDate: undefined,
    timeZone: undefined,
    venue: undefined,
    endDate: '2026-12-20T12:00:00.000Z',
    motivo,
  });
  assert.equal(r.ok, true, r.ok ? '' : r.erros.join(' | '));
  assert.deepEqual(r.alterados, ['endDate']);
  assert.equal(r.depois.venue, 'Centro de Convenções');
});
