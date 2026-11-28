import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { podeOperar } from '../src/platform-moderation-enforcement.ts';

const src = readFileSync(new URL('../src/event-desk.service.ts', import.meta.url), 'utf8');

// Evita esquecer o guard ao criar/editar uma rota do posto: o catálogo cobre
// os mutadores atuais e precisa ser atualizado quando novos forem adicionados.
const operacoes = [
  'checkInReservation', 'reverseCheckIn', 'badge',
  'deliverMaterial', 'reverseMaterial',
  'markDayPresence', 'reverseDayPresence', 'recordActivityAccess',
  'registrationTarget', 'registrationRecord', 'correctRegistration', 'draw',
];
function metodo(nome) {
  const inicio = src.indexOf(`  async ${nome}(`);
  assert.ok(inicio >= 0, `método ${nome} não encontrado`);
  const proximo = src.indexOf('\n  async ', inicio + 8);
  return src.slice(inicio, proximo < 0 ? src.length : proximo);
}

test('todas as operações mutáveis atuais do balcão verificam moderação antes de prosseguir', () => {
  for (const nome of operacoes) {
    assert.match(metodo(nome).slice(0, 470), /this\.requireBalcaoOperavel\(event\);/,
      `${nome} não verificou moderação da plataforma antes de operar`);
  }
  assert.equal((src.match(/this\.requireBalcaoOperavel\(event\);/g) || []).length,
    operacoes.length, 'atualize o catálogo e revise qualquer novo ponto de consumo');
});

test('a checagem de moderação nega estados desconhecidos sem vazar motivos', () => {
  assert.equal(podeOperar(null, 'acesso_operacional').permitido, true);
  for (const state of ['SUSPENSO', 'REMOVIDO', 'invalido']) {
    assert.equal(podeOperar({ state }, 'acesso_operacional').permitido, false);
  }
  assert.match(src, /private requireBalcaoOperavel\([\s\S]*?podeOperar\(event\.moderacao, 'acesso_operacional'\)/);
  assert.match(src, /throw new NotFoundException\('Evento não encontrado\.'\)/);
});

test('leituras do balcão permanecem disponíveis para investigação e auditoria', () => {
  for (const nome of ['context', 'search', 'report']) {
    assert.doesNotMatch(metodo(nome), /this\.requireBalcaoOperavel\(event\);/,
      `${nome} não pode ser bloqueado pela moderação: preservar evidências`);
  }
  const evento = src.slice(src.indexOf('  private async eventFor('), src.indexOf('  private requireCapability('));
  assert.match(evento, /authorization\.requireRole/);
  assert.match(evento, /platformEventModeration\.findUnique/);
  assert.ok(evento.indexOf('authorization.requireRole') < evento.indexOf('platformEventModeration.findUnique'),
    'a consulta de moderação deve acontecer após autorização do tenant');
});
