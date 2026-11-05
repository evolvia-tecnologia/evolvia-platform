import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.ts';
import { conferirPlano, planejarConcessao, planejarRevogacao, proximaSequencia } from './operator-capability-transaction.ts';
import type { AcaoDeOperador, Concessao, PapelNaOrganizacao } from './operator-capability-policy.ts';

/** Contexto que a decisão de autorização precisa. */
export interface ContextoDoAtor {
  readonly organizationId: string;
  readonly papel: PapelNaOrganizacao;
  readonly capacidadesDoEvento: readonly string[];
  readonly concessoes: readonly Concessao[];
}

/**
 * Adaptador Prisma das capacidades do operador.
 *
 * De propósito fino: quem decide O QUE escrever é
 * `operator-capability-transaction.ts`, em função pura e testada. Aqui só se
 * executa o plano. Essa separação existe porque o Node não parseia decorators,
 * logo este arquivo não pode ser conferido na sessão que o escreveu — então ele
 * carrega o mínimo possível de decisão.
 *
 * Isolamento multi-tenant: nenhuma consulta recebe `organizationId` do
 * chamador. A organização é sempre a DO EVENTO, lida do próprio evento. Um id
 * vindo do token ou do corpo da requisição não amplia o alcance de nada.
 */
@Injectable()
export class OperatorCapabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Papel, capacidades do evento e concessões ativas. `null` quando o evento
   * não existe, não tem organização, ou a pessoa não é membro ativo dela —
   * indistinguíveis de propósito, para que o chamador responda 404 sem revelar
   * que o evento existe.
   */
  async contextoDoAtor(userId: string, eventId: string): Promise<ContextoDoAtor | null> {
    const evento = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true, capabilities: { where: { status: 'ACTIVE' }, select: { code: true } } },
    });
    if (!evento || !evento.organizationId) return null;
    const organizationId = evento.organizationId;

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true, status: true },
    });
    if (!membership || String(membership.status) !== 'ACTIVE') return null;

    const ativas = await this.prisma.eventOperatorGrant.findMany({
      where: { eventId, organizationId, targetUserId: userId },
      select: { action: true },
    });

    return {
      organizationId,
      papel: String(membership.role) as PapelNaOrganizacao,
      capacidadesDoEvento: evento.capabilities.map((c) => c.code),
      concessoes: ativas.map((c) => ({
        organizationId,
        eventId,
        userId,
        acao: c.action,
        revogadaEm: null,
      })),
    };
  }

  /** Ações ativas de uma pessoa, já como lista de códigos. */
  async acoesAtivas(organizationId: string, eventId: string, targetUserId: string): Promise<string[]> {
    const linhas = await this.prisma.eventOperatorGrant.findMany({
      where: { organizationId, eventId, targetUserId },
      select: { action: true },
    });
    return linhas.map((l) => l.action);
  }

  /**
   * Se já houve impressão CONCLUÍDA. Conta apenas `CONFIRMED`: uma tentativa
   * não gasta a primeira impressão de ninguém nem passa a exigir reimpressão.
   */
  async jaImprimiu(eventId: string, reservationId: string): Promise<boolean> {
    if (!reservationId) return false;
    const total = await this.prisma.eventCredentialPrint.count({
      where: { eventId, reservationId, kind: 'CONFIRMED' },
    });
    return total > 0;
  }

  /**
   * Registra a emissão da etiqueta como TENTATIVA e devolve a posição ocupada.
   * Em corrida, a unicidade (evento, inscrição, tipo, sequência) faz a segunda
   * inserção falhar; o laço reconsulta em vez de ocupar a mesma posição.
   */
  async registrarTentativaDeImpressao(dados: {
    organizationId: string;
    eventId: string;
    reservationId: string;
    actorUserId: string;
  }): Promise<number> {
    let ultimoErro: unknown = null;
    for (let i = 0; i < 5; i += 1) {
      const anteriores = await this.prisma.eventCredentialPrint.count({
        where: { eventId: dados.eventId, reservationId: dados.reservationId, kind: 'ISSUED' },
      });
      const sequence = proximaSequencia(anteriores);
      try {
        await this.prisma.eventCredentialPrint.create({ data: { ...dados, kind: 'ISSUED', sequence } });
        return sequence;
      } catch (erro) {
        ultimoErro = erro;
        if (!this.ehConflitoDeUnicidade(erro)) throw erro;
      }
    }
    throw ultimoErro instanceof Error ? ultimoErro : new Error('Não foi possível registrar a impressão.');
  }

  /** Confirma que a etiqueta saiu impressa. Só isto conta como impressão. */
  async confirmarImpressao(dados: {
    organizationId: string;
    eventId: string;
    reservationId: string;
    actorUserId: string;
    sequence: number;
  }): Promise<void> {
    try {
      await this.prisma.eventCredentialPrint.create({ data: { ...dados, kind: 'CONFIRMED' } });
    } catch (erro) {
      // Confirmar a mesma tentativa duas vezes é idempotente, não erro.
      if (!this.ehConflitoDeUnicidade(erro)) throw erro;
    }
  }

  private ehConflitoDeUnicidade(erro: unknown): boolean {
    return typeof erro === 'object' && erro !== null && (erro as { code?: unknown }).code === 'P2002';
  }

  /**
   * Concede numa única transação: projeção e razão mudam juntas ou nenhuma
   * muda. O plano vem da função pura e é conferido ANTES de abrir a transação —
   * plano inconsistente aborta sem tocar o banco, nunca no meio.
   */
  async conceder(dados: {
    organizationId: string;
    eventId: string;
    targetUserId: string;
    actorUserId: string;
    reason: string;
    acoes: readonly AcaoDeOperador[];
  }): Promise<{ aplicadas: AcaoDeOperador[]; semEfeito: AcaoDeOperador[] }> {
    const ativas = await this.acoesAtivas(dados.organizationId, dados.eventId, dados.targetUserId);
    const plano = planejarConcessao(dados.acoes, ativas);
    const problemas = conferirPlano(plano, dados.acoes);
    if (problemas.length > 0) throw new Error(`Plano de concessão inconsistente: ${problemas.join('; ')}`);
    await this.executar(dados, plano);
    return { aplicadas: plano.passos.map((p) => p.projecao.acao), semEfeito: [...plano.semEfeito] };
  }

  /**
   * Revoga numa única transação. A linha sai da projeção, o que invalida a
   * permissão imediatamente, e a revogação entra na razão como registro NOVO.
   */
  async revogar(dados: {
    organizationId: string;
    eventId: string;
    targetUserId: string;
    actorUserId: string;
    reason: string;
    acoes: readonly AcaoDeOperador[];
  }): Promise<{ aplicadas: AcaoDeOperador[]; semEfeito: AcaoDeOperador[] }> {
    const ativas = await this.acoesAtivas(dados.organizationId, dados.eventId, dados.targetUserId);
    const plano = planejarRevogacao(dados.acoes, ativas);
    const problemas = conferirPlano(plano, dados.acoes);
    if (problemas.length > 0) throw new Error(`Plano de revogação inconsistente: ${problemas.join('; ')}`);
    await this.executar(dados, plano);
    return { aplicadas: plano.passos.map((p) => p.projecao.acao), semEfeito: [...plano.semEfeito] };
  }

  /** Executa os pares do plano. Cada passo escreve projeção E razão. */
  private async executar(
    dados: {
      organizationId: string;
      eventId: string;
      targetUserId: string;
      actorUserId: string;
      reason: string;
    },
    plano: ReturnType<typeof planejarConcessao>,
  ): Promise<void> {
    if (plano.passos.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      for (const passo of plano.passos) {
        if (passo.projecao.tipo === 'criar') {
          await tx.eventOperatorGrant.create({
            data: {
              organizationId: dados.organizationId,
              eventId: dados.eventId,
              targetUserId: dados.targetUserId,
              action: passo.projecao.acao,
              grantedByUserId: dados.actorUserId,
            },
          });
        } else {
          await tx.eventOperatorGrant.delete({
            where: {
              eventId_targetUserId_action: {
                eventId: dados.eventId,
                targetUserId: dados.targetUserId,
                action: passo.projecao.acao,
              },
            },
          });
        }
        await tx.eventOperatorGrantEvent.create({
          data: {
            organizationId: dados.organizationId,
            eventId: dados.eventId,
            targetUserId: dados.targetUserId,
            actorUserId: dados.actorUserId,
            action: passo.razao.acao,
            reason: dados.reason,
            kind: passo.razao.kind,
          },
        });
      }
    });
  }

  /** Concessões ativas de todas as pessoas do evento, para a tela do organizador. */
  async concessoesDoEvento(organizationId: string, eventId: string) {
    return this.prisma.eventOperatorGrant.findMany({
      where: { organizationId, eventId },
      select: { targetUserId: true, action: true, grantedAt: true, grantedByUserId: true },
      orderBy: [{ targetUserId: 'asc' }, { action: 'asc' }],
    });
  }

  /** Histórico append-only do evento, mais recente primeiro. */
  async historico(organizationId: string, eventId: string, limite: number) {
    return this.prisma.eventOperatorGrantEvent.findMany({
      where: { organizationId, eventId },
      select: {
        kind: true,
        action: true,
        targetUserId: true,
        actorUserId: true,
        reason: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(Math.trunc(limite) || 1, 1), 500),
    });
  }

  /** Membros da organização do evento que podem receber concessão. */
  async operadoresDaOrganizacao(organizationId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { userId: true, role: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
