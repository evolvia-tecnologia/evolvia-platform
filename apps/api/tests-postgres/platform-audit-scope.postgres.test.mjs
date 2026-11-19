// Disposable CI database only; fixture rows are preserved.
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
import { PrismaClient } from '@prisma/client';
import { PlatformMasterRepository } from '../dist/platform-master.repository.js';
import { PlatformMasterService } from '../dist/platform-master.service.js';

const db = new PrismaClient();
after(() => db.$disconnect());

const repositorio = new PlatformMasterRepository(db);
// `webauthn` fica fora: `conceder` não o toca, e um dublê aqui sugeriria que a
// cerimônia participa desta prova.
const servico = new PlatformMasterService(db, repositorio, null);

const MOTIVO = 'acesso de consulta pedido pela auditoria interna';
const dias = (n) => new Date(Date.now() + n * 86400_000).toISOString();

// O filtro completo, sem estreitar nada. Cada caso parte daqui e muda um campo,
// para que a diferença entre os casos seja exatamente o que está sendo testado.
const FILTRO = { acoes: [], resultados: [], actorUserId: null, targetUserId: null, de: null, ate: null, limite: 50 };

const pessoa = (rotulo) => db.user.create({
  data: { name: rotulo, email: `auditoria-${randomUUID()}@evolvia-ci.local`, passwordHash: 'fixture' },
});

async function cenario(quantosEventos = 1) {
  const proprietario = await pessoa('AUD proprietário');
  const colaborador = await pessoa('AUD colaborador');
  const organizacao = await db.organization.create({
    data: { name: `AUD org ${randomUUID()}`, slug: `aud-org-${randomUUID()}`, createdById: proprietario.id },
  });
  const eventos = [];
  for (let i = 0; i < quantosEventos; i += 1) {
    eventos.push(await db.event.create({
      data: {
        ownerId: proprietario.id,
        organizationId: organizacao.id,
        name: `AUD evento ${i + 1}`,
        slug: `aud-evento-${randomUUID()}`,
        eventType: 'CONGRESSO',
        format: 'IN_PERSON',
        registrationMode: 'FREE',
      },
    }));
  }
  return { proprietario, colaborador, organizacao, eventos };
}

const contexto = () => ({ identityId: randomUUID(), sessionId: randomUUID(), tokenHash: randomUUID() });

const pedido = (pessoas, eventIds, acoes = ['consultar']) => ({
  pessoas: pessoas.map((p) => p.id),
  acoes,
  escopo: { tipo: 'EVENTOS', eventIds },
  motivo: MOTIVO,
  expiraEm: dias(30),
});

test('a concessão a um evento APARECE na trilha restrita a esse evento', async () => {
  const { proprietario, colaborador, eventos } = await cenario();
  const evento = eventos[0];

  await servico.conceder(proprietario.id, contexto(), pedido([colaborador], [evento.id]));

  const trilha = await repositorio.trilhaDeAuditoria({ eventId: evento.id }, FILTRO);

  // Este assert é o defeito inteiro: antes da correção `trilha` vinha vazia,
  // porque a única linha gravada em PlatformAuditLog tem `eventId` vazio.
  assert.ok(
    trilha.length > 0,
    'a trilha do evento não mostrou a mudança de acesso: era este o defeito, e o proprietário não tinha como perceber',
  );
  const concessao = trilha.find((l) => l.action === 'conceder');
  assert.ok(concessao, 'a trilha do evento não tem nenhuma linha de concessão');
  assert.equal(concessao.eventId, evento.id);
  assert.equal(concessao.targetUserId, colaborador.id);
});

test('o filtro por destinatário acha a concessão, e só a dele', async () => {
  const { proprietario, colaborador, eventos } = await cenario();
  const outra = await pessoa('AUD outra pessoa');

  // As duas na MESMA concessão: se o filtro for ignorado, as duas voltam e o
  // caso morre. Sem a segunda pessoa, filtrar e não filtrar dariam o mesmo.
  await servico.conceder(proprietario.id, contexto(), pedido([colaborador, outra], [eventos[0].id]));

  const trilha = await repositorio.trilhaDeAuditoria({}, { ...FILTRO, targetUserId: colaborador.id });

  const concessoes = trilha.filter((l) => l.action === 'conceder');
  assert.ok(concessoes.length > 0, 'o filtro por destinatário não achou a concessão nem no relatório global');
  assert.ok(
    concessoes.every((l) => l.targetUserId === colaborador.id),
    'o filtro por destinatário trouxe a concessão de outra pessoa',
  );
});

test('a trilha de um evento NÃO mostra a concessão feita a outro evento', async () => {
  const { proprietario, colaborador, eventos } = await cenario(2);
  const [primeiro, segundo] = eventos;

  await servico.conceder(proprietario.id, contexto(), pedido([colaborador], [primeiro.id]));
  await servico.conceder(proprietario.id, contexto(), pedido([colaborador], [segundo.id]));

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

test('pedir uma ação que não existe no histórico não traz concessão nenhuma', async () => {
  const { proprietario, colaborador, eventos } = await cenario();

  await servico.conceder(proprietario.id, contexto(), pedido([colaborador], [eventos[0].id]));

  // `suspender` é ação CONCEDIDA, nunca operação administrativa. Traduzir
  // "nenhuma ação do filtro existe no histórico" para "sem filtro" alargaria o
  // pedido, e num relatório de auditoria isso mostra o que não foi pedido.
  const trilha = await repositorio.trilhaDeAuditoria({ eventId: eventos[0].id }, { ...FILTRO, acoes: ['suspender'] });

  assert.ok(
    !trilha.some((l) => l.action === 'conceder' || l.action === 'revogar'),
    'o filtro por ação foi alargado: o relatório trouxe concessões que ninguém pediu',
  );
});

test('a linha trazida leva os vínculos: ator, destinatário, evento e a ação concedida', async () => {
  const { proprietario, colaborador, eventos } = await cenario();
  const evento = eventos[0];

  await servico.conceder(proprietario.id, contexto(), pedido([colaborador], [evento.id], ['moderar']));

  const trilha = await repositorio.trilhaDeAuditoria({ eventId: evento.id }, FILTRO);
  const linha = trilha.find((l) => l.action === 'conceder');
  assert.ok(linha, 'nenhuma linha de concessão na trilha do evento');

  // Trazer a linha sem os vínculos resolveria a consulta e não o relatório:
  // quem lê precisa saber QUEM deu O QUÊ A QUEM, e em qual evento.
  assert.equal(linha.actorUserId, proprietario.id, 'a linha perdeu o autor da ação');
  assert.equal(linha.targetUserId, colaborador.id, 'a linha perdeu o destinatário');
  assert.equal(linha.eventId, evento.id, 'a linha perdeu o evento');
  assert.equal(linha.scopeKind, 'EVENTO');
  assert.equal(linha.result, 'ALLOWED');
  assert.equal(linha.reason, MOTIVO, 'a linha perdeu o motivo declarado');
  assert.equal(
    linha.changes?.acaoConcedida,
    'moderar',
    'a ação concedida não chegou em `changes`: sem ela a linha diz que houve concessão, mas não de quê',
  );
});
