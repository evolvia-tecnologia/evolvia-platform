import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OperatorCapabilityRepository } from './operator-capability.repository.ts';
import { catalogoParaInterface, decidirGestaoDeConcessao, mensagemDaRecusa } from './operator-capability-grant-policy.ts';
import { PERFIS_DE_OPERADOR } from './operator-capability-policy.ts';
import type { Alvo } from './operator-capability-grant-policy.ts';
import type { PapelNaOrganizacao } from './operator-capability-policy.ts';

const PAPEIS_DE_ORGANIZADOR: readonly PapelNaOrganizacao[] = ['OWNER', 'ADMIN', 'MANAGER'];

/**
 * Gestão das capacidades do operador, para o organizador (G10.10).
 *
 * Fino de propósito: toda a decisão de quem-pode-o-quê está em
 * `operator-capability-grant-policy.ts`, pura e testada; e o que escrever está
 * em `operator-capability-transaction.ts`, também pura. Aqui só se resolve o
 * contexto, chama-se a decisão e traduz-se a recusa em código HTTP.
 *
 * Dois códigos, deliberadamente diferentes: 404 quando quem pede não é membro
 * ativo da organização do evento — revelar que o evento existe já seria
 * vazamento, e a mensagem é a MESMA que o balcão usa; 403 quando é membro mas
 * não é organizador, porque aí a pessoa já sabe que o evento existe e merece
 * saber que o problema é permissão.
 */
@Injectable()
export class OperatorCapabilityService {
  constructor(private readonly repositorio: OperatorCapabilityRepository) {}

  /** Tela do organizador: catálogo, perfis, operadores e o que cada um tem. */
  async painel(actorUserId: string, eventId: string) {
    const contexto = await this.exigirOrganizador(actorUserId, eventId);
    const [membros, concessoes] = await Promise.all([
      this.repositorio.operadoresDaOrganizacao(contexto.organizationId),
      this.repositorio.concessoesDoEvento(contexto.organizationId, eventId),
    ]);

    const porPessoa = new Map<string, string[]>();
    for (const c of concessoes) {
      const atual = porPessoa.get(c.targetUserId) ?? [];
      atual.push(c.action);
      porPessoa.set(c.targetUserId, atual);
    }

    return {
      escopado: contexto.capacidadesDoEvento.includes('operator_scoped_access'),
      catalogo: catalogoParaInterface(),
      perfis: Object.entries(PERFIS_DE_OPERADOR).map(([nome, acoes]) => ({ nome, acoes: [...acoes] })),
      operadores: membros
        .filter((m) => String(m.role) === 'OPERATOR')
        .map((m) => ({
          userId: m.userId,
          nome: m.user?.name ?? null,
          acoes: porPessoa.get(m.userId) ?? [],
        })),
    };
  }

  /** Histórico append-only das concessões do evento. */
  async historico(actorUserId: string, eventId: string, limite: unknown) {
    const contexto = await this.exigirOrganizador(actorUserId, eventId);
    const quantas = typeof limite === 'string' ? Number.parseInt(limite, 10) : 200;
    return this.repositorio.historico(contexto.organizationId, eventId, Number.isFinite(quantas) ? quantas : 200);
  }

  async conceder(actorUserId: string, eventId: string, targetUserId: string, corpo: unknown) {
    return this.gerir('conceder', actorUserId, eventId, targetUserId, corpo);
  }

  async revogar(actorUserId: string, eventId: string, targetUserId: string, corpo: unknown) {
    return this.gerir('revogar', actorUserId, eventId, targetUserId, corpo);
  }

  private async gerir(
    operacao: 'conceder' | 'revogar',
    actorUserId: string,
    eventId: string,
    targetUserId: string,
    corpo: unknown,
  ) {
    const contexto = await this.contexto(actorUserId, eventId);
    const entrada = (corpo ?? {}) as { motivo?: unknown; acoes?: unknown; perfil?: unknown };

    const membro = await this.repositorio.membro(contexto.organizationId, targetUserId);
    const alvo: Alvo | null = membro
      ? {
          userId: membro.userId,
          papel: String(membro.role) as PapelNaOrganizacao,
          ativo: String(membro.status) === 'ACTIVE',
        }
      : null;

    const veredito = decidirGestaoDeConcessao({
      papelDoAtor: contexto.papel,
      atorUserId: actorUserId,
      alvo,
      motivo: entrada.motivo,
      acoes: Array.isArray(entrada.acoes) ? entrada.acoes : entrada.acoes === undefined ? undefined : [],
      perfil: entrada.perfil,
    });

    if (!veredito.permitido) {
      const mensagem = mensagemDaRecusa(veredito.motivo!);
      // Não ser organizador vira 403: quem chegou aqui já é membro do evento.
      throw new ForbiddenException(mensagem);
    }

    const dados = {
      organizationId: contexto.organizationId,
      eventId,
      targetUserId,
      actorUserId,
      reason: veredito.justificativa,
      acoes: veredito.acoes,
    };
    const resultado =
      operacao === 'conceder' ? await this.repositorio.conceder(dados) : await this.repositorio.revogar(dados);

    return { operacao, ...resultado };
  }

  private async contexto(actorUserId: string, eventId: string) {
    const contexto = await this.repositorio.contextoDoAtor(actorUserId, eventId);
    if (!contexto) throw new NotFoundException('Evento não encontrado.');
    return contexto;
  }

  private async exigirOrganizador(actorUserId: string, eventId: string) {
    const contexto = await this.contexto(actorUserId, eventId);
    if (!PAPEIS_DE_ORGANIZADOR.includes(contexto.papel)) {
      throw new ForbiddenException(mensagemDaRecusa('ator_nao_e_organizador'));
    }
    return contexto;
  }
}
