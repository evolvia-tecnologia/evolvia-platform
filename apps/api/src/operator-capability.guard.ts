import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { decidirRota, ehRotaDoBalcao } from './operator-capability-enforcement.ts';
import { OperatorCapabilityRepository } from './operator-capability.repository.ts';
import type { RotaDoBalcao } from './operator-capability-enforcement.ts';

export const CHAVE_DA_ROTA_DO_BALCAO = 'evolvia:rota-do-balcao';

/**
 * Declara qual rota do balcão o método atende. O guard usa isso para saber qual
 * ação exigir; sem a marca, ele NEGA.
 */
export const RotaDoBalcaoMarcada = (rota: RotaDoBalcao): MethodDecorator =>
  SetMetadata(CHAVE_DA_ROTA_DO_BALCAO, rota);

interface RequisicaoDoBalcao {
  user?: { id: string };
  params?: Record<string, unknown>;
  body?: unknown;
}

/**
 * Impõe as capacidades do operador por evento (G10.10).
 *
 * Roda depois do `AuthGuard`, que já colocou `request.user`. Não substitui
 * nenhuma verificação do `EventDeskService`: as de lá continuam valendo, e este
 * guard apenas nega antes — defesa em profundidade.
 *
 * Falha fechada em três pontos, e é daí que vem a segurança:
 *   1. método sem `@RotaDoBalcaoMarcada(...)` é negado;
 *   2. rota que não existe no mapa é negada (inclusive para OWNER);
 *   3. qualquer motivo de negativa não previsto cai em 403, nunca em "deixa
 *      passar".
 *
 * Códigos: 404 quando revelar a existência do evento já seria vazamento (não é
 * membro, ou a capacidade do evento está inativa), com a MESMA mensagem que o
 * service usa hoje; 403 quando a pessoa pertence ao evento mas não tem a
 * concessão. Essa distinção é deliberada: quem não é do evento não deve
 * descobrir que ele existe, e quem é do evento merece saber que o problema é
 * permissão.
 */
@Injectable()
export class OperatorCapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly repositorio: OperatorCapabilityRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requisicao = context.switchToHttp().getRequest<RequisicaoDoBalcao>();

    const userId = requisicao.user?.id;
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new NotFoundException('Evento não encontrado.');
    }

    const eventId = requisicao.params?.eventId;
    if (typeof eventId !== 'string' || eventId.length === 0) {
      throw new NotFoundException('Evento não encontrado.');
    }

    const rota = this.reflector.get<unknown>(CHAVE_DA_ROTA_DO_BALCAO, context.getHandler());
    if (!ehRotaDoBalcao(rota)) {
      // Rota do balcão sem permissão declarada: nega, não libera.
      throw new ForbiddenException('Operação sem permissão declarada.');
    }

    const contexto = await this.repositorio.contextoDoAtor(userId, eventId);
    if (!contexto) throw new NotFoundException('Evento não encontrado.');

    const jaImprimiu = rota === 'POST /badge' ? await this.jaImprimiu(eventId, requisicao.body) : false;

    const decisao = decidirRota(rota, {
      papel: contexto.papel,
      organizationId: contexto.organizationId,
      eventId,
      userId,
      capacidadesDoEvento: contexto.capacidadesDoEvento,
      concessoes: contexto.concessoes,
      jaImprimiu,
    });

    if (decisao.permitido) return true;

    if (decisao.motivo === 'papel_sem_acesso_ao_balcao' || decisao.motivo === 'capacidade_do_evento_inativa') {
      throw new NotFoundException('Evento não encontrado.');
    }
    throw new ForbiddenException('Sem permissão para esta operação neste evento.');
  }

  private async jaImprimiu(eventId: string, corpo: unknown): Promise<boolean> {
    const reservationId = (corpo as { reservationId?: unknown } | null | undefined)?.reservationId;
    if (typeof reservationId !== 'string' || reservationId.length === 0) return false;
    return this.repositorio.jaImprimiu(eventId, reservationId);
  }
}
