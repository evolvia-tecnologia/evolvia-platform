// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// O relatório de auditoria por EVENTO e por DESTINATÁRIO só se prova com banco,
// porque o defeito era de CONSULTA e não de regra: a linha de `PlatformAuditLog`
// de uma concessão sai com `eventId` e `targetUserId` vazios — uma concessão
// alcança N pessoas × M eventos, e isso não cabe em coluna escalar — e
// `trilhaDeAuditoria` filtrava justamente por essas colunas. Resultado: o
// relatório do evento nunca mostrava mudança de acesso e o filtro por
// destinatário não as encontrava nem no relatório global.
//
// Nenhum teste com cliente falso enxerga isto, porque o que estava errado era o
// `where` — e cliente falso devolve o que o dublê mandar, independente do
// `where`. Só PostgreSQL responde "a consulta como está escrita acha ou não".
//
// O alvo aqui é `PlatformMasterRepository.trilhaDeAuditoria`, que é a função que
// mudou. `dentroDoEscopo` e `montarRelatorio` são puros, já têm teste de unidade
// e não foram tocados; compor as três aqui testaria sobretudo o que já está
// coberto e tornaria mais difícil ler qual camada falhou.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  PlatformMasterRepository, derrubarApp, evento, motivoValido,
  organizacao, pessoa, prisma,
} from './master-fixtures.mjs';

const { PlatformMasterService } = await import('../dist/platform-master.service.js');

after(async () => { await derrubarApp(); });

const repositorio = new PlatformMasterRepository(prisma);
// `webauthn` fica fora: `conceder` não o toca, e um dublê aqui sugeriria que a
// cerimônia participa desta prova. O serviço é construído à mão em vez de vir do
// container porque subir o Nest não acrescenta nada ao que se mede.
const servico = new PlatformMasterService(prisma, repositorio, null);

const dias = (n) => new Date(Date.now() + n * 86400_000).toISOString();

// O filtro completo, sem estreitar nada. Cada caso parte daqui e muda um campo,
// para que a diferença entre os casos seja exatamente o que está sendo testado.
const FILTRO = { acoes: [], resultados: [], actorUserId: null, targetUserId: null, de: null, ate: null, limite: 50 };

async function cenario(rotulo, quantosEventos = 1) {
  const proprietario = await pessoa(`${rotulo}-owner`);
  const colaborador = await pessoa(`${rotulo}-colab`);
  const org = await organizacao(rotulo, proprietario.id);
  const eventos = [];
  for (let i = 0; i < quantosEventos; i += 1) {
    eventos.push(await evento(`${rotulo}-${i}`, proprietario.id, org.id));
  }
  return { proprietario, colaborador, org, eventos };
}

const contexto = () => ({ identityId: randomUUID(), sessionId: randomUUID(), tokenHash: randomUUID() });

/**
 * As ações vêm do catálogo canônico (`ACOES_CONCEDIVEIS`).
 *
 * Na primeira versão eu concedi `moderar`, que não existe, e o servidor recusou
 * — corretamente. Catálogo fechado recusando ação desconhecida é a regra
 * funcionando; se tivesse aceitado, aí sim haveria bug.
 */
const pedido = (pessoas, eventIds, acoes = ['consultar']) => ({
  pessoas: pessoas.map((p) => p.id),
  acoes,
  escopo: { tipo: 'EVENTOS', eventIds },
  motivo: motivoValido,
  expiraEm: dias(30),
});

test('a concessão a um evento APARECE na trilha restrita a esse evento', { timeout: 120000 }, async () => {
  const c = await cenario('aud-escopo-ve');
  const alvo = c.eventos[0];

  await servico.conceder(c.proprietario.id, contexto(), pedido([c.colaborador], [alvo.id]));

  const trilha = await repositorio.trilhaDeAuditoria({ eventId: alvo.id }, FILTRO);

  // Este assert é o defeito inteiro: antes da correção `trilha` vinha vazia,
  // porque a única linha gravada em PlatformAuditLog tem `eventId` vazio.
  assert.ok(
    trilha.length > 0,
    'a trilha do evento não mostrou a mudança de acesso: era este o defeito, e o proprietário não tinha como perceber',
  );
  const concessao = trilha.find((l) => l.action === 'conceder');
  assert.ok(concessao, 'a trilha do evento não tem nenhuma linha de concessão');
  assert.equal(concessao.eventId, alvo.id);
  assert.equal(concessao.targetUserId, c.colaborador.id);
});

test('o filtro por destinatário acha a concessão, e só a dele', { timeout: 120000 }, async () => {
  const c = await cenario('aud-escopo-dest');
  const outra = await pessoa('aud-escopo-dest-outra');

  // As duas na MESMA concessão: se o filtro for ignorado, as duas voltam e o
  // caso morre. Sem a segunda pessoa, filtrar e não filtrar dariam o mesmo.
  await servico.conceder(c.proprietario.id, contexto(), pedido([c.colaborador, outra], [c.eventos[0].id]));

  const trilha = await repositorio.trilhaDeAuditoria({}, { ...FILTRO, targetUserId: c.colaborador.id });

  const concessoes = trilha.filter((l) => l.action === 'conceder');
  assert.ok(concessoes.length > 0, 'o filtro por destinatário não achou a concessão nem no relatório global');
  assert.ok(
    concessoes.every((l) => l.targetUserId === c.colaborador.id),
    'o filtro por destinatário trouxe a concessão de outra pessoa',
  );
});

test('a trilha de um evento NÃO mostra a concessão feita a outro evento', { timeout: 120000 }, async () => {
  const c = await cenario('aud-escopo-iso', 2);
  const [primeiro, segundo] = c.eventos;

  await servico.conceder(c.proprietario.id, contexto(), pedido([c.colaborador], [primeiro.id]));
  await servico.conceder(c.proprietario.id, contexto(), pedido([c.colaborador], [segundo.id]));

  const trilha = await repositorio.trilhaDeAuditoria({ eventId: primeiro.id }, FILTRO);

  // A parte perigosa de passar a ler uma tabela nova. Sem este caso, a correção
  // poderia ter vazado acesso entre eventos e os casos acima seguiriam verdes.
  assert.ok(trilha.length > 0, 'a trilha do primeiro evento ficou vazia');
  assert.ok(
    trilha.every((l) => l.eventId === '' || l.eventId === primeiro.id),
    'a trilha de um evento vazou a concessão de outro: isolamento entre eventos quebrado',
  );
  assert.ok(
    !trilha.some((l) => l.eventId === segundo.id),
    'a concessão do segundo evento apareceu na trilha do primeiro',
  );
});

test('pedir uma ação que não existe no histórico não traz concessão nenhuma', { timeout: 120000 }, async () => {
  const c = await cenario('aud-escopo-filtro');

  await servico.conceder(c.proprietario.id, contexto(), pedido([c.colaborador], [c.eventos[0].id]));

  // `suspender` é ação CONCEDIDA, nunca operação administrativa. Traduzir
  // "nenhuma ação do filtro existe no histórico" para "sem filtro" alargaria o
  // pedido, e num relatório de auditoria isso mostra o que não foi pedido.
  const trilha = await repositorio.trilhaDeAuditoria(
    { eventId: c.eventos[0].id },
    { ...FILTRO, acoes: ['suspender'] },
  );

  assert.ok(
    !trilha.some((l) => l.action === 'conceder' || l.action === 'revogar'),
    'o filtro por ação foi alargado: o relatório trouxe concessões que ninguém pediu',
  );
});

test('a linha trazida leva os vínculos: ator, destinatário, evento e a ação concedida', { timeout: 120000 }, async () => {
  const c = await cenario('aud-escopo-vinculo');
  const alvo = c.eventos[0];

  // `suspender` vem do catálogo, e serve melhor que uma ação de consulta: é a
  // concessão de moderar que uma auditoria precisa reconstituir.
  await servico.conceder(c.proprietario.id, contexto(), pedido([c.colaborador], [alvo.id], ['suspender']));

  const trilha = await repositorio.trilhaDeAuditoria({ eventId: alvo.id }, FILTRO);
  const linha = trilha.find((l) => l.action === 'conceder');
  assert.ok(linha, 'nenhuma linha de concessão na trilha do evento');

  // Trazer a linha sem os vínculos resolveria a consulta e não o relatório:
  // quem lê precisa saber QUEM deu O QUÊ A QUEM, e em qual evento.
  assert.equal(linha.actorUserId, c.proprietario.id, 'a linha perdeu o autor da ação');
  assert.equal(linha.targetUserId, c.colaborador.id, 'a linha perdeu o destinatário');
  assert.equal(linha.eventId, alvo.id, 'a linha perdeu o evento');
  assert.equal(linha.scopeKind, 'EVENTO');
  assert.equal(linha.result, 'ALLOWED');
  assert.equal(linha.reason, motivoValido, 'a linha perdeu o motivo declarado');
  assert.equal(
    linha.changes?.acaoConcedida,
    'suspender',
    'a ação concedida não chegou em `changes`: sem ela a linha diz que houve concessão, mas não de quê',
  );
});
