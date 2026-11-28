/**
 * CL01-B — identidade do evento para a moldura do operador restrito.
 *
 * O QUE ESTES CASOS IMPEDEM DE VOLTAR
 * -----------------------------------
 * `RestrictedOperatorFrame` tirava nome do evento e da organização do payload
 * do CONSTRUTOR de eventos. Aquela consulta exige OWNER/ADMIN/MANAGER
 * (`EventWizardService.requireReadableEvent`), então para OPERATOR responde
 * 403 e o payload não chega. Somado à ordem de despacho antiga — em que o
 * retorno de `shell === 'error'` vinha ANTES da seleção do shell restrito —, o
 * operador recebia `ClosedPanel` e a moldura dele nunca montava.
 *
 * `identidadeDoEvento` é a parte pura desse conserto: resolve a identidade sem
 * exigir o payload, e DEGRADA para vazio em vez de bloquear.
 *
 * O caso `sem nenhuma fonte` é o que prende a regra de não fabricar: a função
 * tem de devolver vazio e dizer que é vazio, para a moldura omitir o bloco.
 * Devolver um rótulo como "Evento" passaria neste arquivo se a asserção fosse
 * só `typeof === 'string'` — por isso se afirma o vazio explicitamente.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { identidadeDoEvento } from '../lib/operator-journey.ts';

const capacidades = (evento) => ({
  escopado: true,
  papel: 'OPERATOR',
  acoes: [{ acao: 'checkin', capacidade: 'access_control', sensivel: false }],
  ...(evento === undefined ? {} : { evento }),
});

const doPayload = (name, orgName) => ({ name, organization: { name: orgName } });

test('o que o servidor manda tem precedência sobre o payload do construtor', () => {
  const id = identidadeDoEvento(
    capacidades({ nome: 'Congresso do Servidor', organizacao: 'Org do Servidor' }),
    doPayload('Congresso do Payload', 'Org do Payload'),
  );
  assert.equal(id.evento, 'Congresso do Servidor');
  assert.equal(id.organizacao, 'Org do Servidor');
  assert.equal(id.conhecida, true);
});

test('sem identidade do servidor, resolve pelo payload — compatibilidade de hoje', () => {
  const id = identidadeDoEvento(capacidades(undefined), doPayload('Feira Anual', 'Instituto X'));
  assert.equal(id.evento, 'Feira Anual');
  assert.equal(id.organizacao, 'Instituto X');
  assert.equal(id.conhecida, true);
});

test('O CASO DO BUG: payload ausente (403 do construtor) não impede a identidade', () => {
  // É este o cenário do OPERATOR: o payload nunca chega. Com a identidade
  // vinda do servidor, a moldura monta com nome; sem ela, monta sem nome — mas
  // monta, que é o conserto.
  const comServidor = identidadeDoEvento(capacidades({ nome: 'Evento Real', organizacao: 'Org Real' }), null);
  assert.equal(comServidor.evento, 'Evento Real');
  assert.equal(comServidor.organizacao, 'Org Real');
  assert.equal(comServidor.conhecida, true);
});

test('sem nenhuma fonte: vazio declarado como vazio, NUNCA um nome fabricado', () => {
  const id = identidadeDoEvento(capacidades(undefined), null);
  assert.equal(id.evento, '', 'inventou nome de evento');
  assert.equal(id.organizacao, '', 'inventou nome de organização');
  assert.equal(id.conhecida, false, 'declarou conhecida uma identidade que não tem fonte');
});

test('fontes parciais se compõem, campo a campo', () => {
  const soNome = identidadeDoEvento(capacidades({ nome: 'Só o Nome' }), doPayload(null, 'Org do Payload'));
  assert.equal(soNome.evento, 'Só o Nome');
  assert.equal(soNome.organizacao, 'Org do Payload');
  assert.equal(soNome.conhecida, true);

  const soOrg = identidadeDoEvento(capacidades({ organizacao: 'Só a Org' }), doPayload('Nome do Payload', null));
  assert.equal(soOrg.evento, 'Nome do Payload');
  assert.equal(soOrg.organizacao, 'Só a Org');
});

test('string em branco não conta como fonte, e cai para a seguinte', () => {
  const id = identidadeDoEvento(capacidades({ nome: '   ', organizacao: '' }), doPayload('Nome Util', 'Org Util'));
  assert.equal(id.evento, 'Nome Util');
  assert.equal(id.organizacao, 'Org Util');

  const vazio = identidadeDoEvento(capacidades({ nome: '  ' }), doPayload('  ', '\t'));
  assert.equal(vazio.evento, '');
  assert.equal(vazio.organizacao, '');
  assert.equal(vazio.conhecida, false);
});

test('entrada ausente ou inesperada não lança — a moldura não pode quebrar na borda', () => {
  for (const resposta of [null, undefined, capacidades(null)]) {
    const id = identidadeDoEvento(resposta, null);
    assert.equal(id.evento, '');
    assert.equal(id.conhecida, false);
  }
  // valores de tipo errado vindos de uma resposta malformada
  const torto = identidadeDoEvento({ escopado: true, papel: 'OPERATOR', acoes: [],
    evento: { nome: 42, organizacao: {} } }, null);
  assert.equal(torto.evento, '');
  assert.equal(torto.organizacao, '');
  assert.equal(torto.conhecida, false);
});

test('o campo `evento` é opcional: a forma de hoje do servidor segue válida', () => {
  // Se este caso quebrar, é porque `evento` deixou de ser opcional e todo
  // chamador existente — inclusive o servidor, que ainda não o envia — passou
  // a estar errado.
  const hoje = { escopado: false, papel: 'OPERATOR', acoes: [] };
  const id = identidadeDoEvento(hoje, doPayload('Do Payload', 'Org'));
  assert.equal(id.evento, 'Do Payload');
  assert.equal(id.conhecida, true);
});
