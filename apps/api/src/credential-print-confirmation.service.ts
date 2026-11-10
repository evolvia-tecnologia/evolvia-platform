import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.ts';
import { OperatorCapabilityRepository } from './operator-capability.repository.ts';
import { ACAO_DE_IMPRESSAO, decidirAcaoDeOperador } from './operator-capability-policy.ts';

/**
 * As duas únicas ações que uma impressão pode exigir, derivadas da constante
 * da política — fonte única da verdade do par.
 *
 * Por que não chamar o helper da política: ele declara retorno
 * `AcaoDeOperador`, a união das dezessete ações, e atribuir isso a um campo de
 * duas quebra a compilação (TS2322). As saídas seriam alargar este contrato,
 * usar cast, ou estreitar a assinatura dele. Alargar e castear escondem o
 * problema. Aqui se consome a MESMA constante que ele consome, sem duplicar o
 * mapeamento, e um teste fixa a equivalência entre os dois: se algum dia
 * divergirem, reprova. Estreitar a assinatura na origem segue recomendado e
 * vai como patch de uma linha à parte.
 */
export type AcaoDeImpressao = (typeof ACAO_DE_IMPRESSAO)[keyof typeof ACAO_DE_IMPRESSAO];

export interface PedidoDeConfirmacao {
  readonly reservationId?: unknown;
  readonly sequence?: unknown;
}

export interface ResultadoDaConfirmacao {
  readonly sequence: number;
  readonly acaoExigida: AcaoDeImpressao;
  readonly concluida: true;
  /** true = esta sequência já estava confirmada; nada foi gravado de novo. */
  readonly repetida: boolean;
}

/**
 * Confirmação de que a etiqueta saiu impressa.
 *
 * Existe separada da emissão de propósito: `EventDeskService.badge()` devolve o
 * conteúdo da etiqueta e grava `ISSUED`, que é TENTATIVA. Só esta rota grava
 * `CONFIRMED`, e só `CONFIRMED` conta em `jaImprimiu`. Uma prévia fechada, uma
 * impressora desligada ou um papel atolado não gastam a primeira impressão de
 * ninguém — arquivo gerado não é papel impresso.
 *
 * O ponto difícil é a concorrência. Não basta gravar: duas confirmações
 * simultâneas contariam zero impressões concluídas cada uma, as duas se
 * declarariam "primeira impressão" e a segunda viraria impressão concluída sem
 * nunca ter precisado de `credencial_reimprimir`. Por isso contar, decidir e
 * gravar acontecem na MESMA transação, atrás de um `FOR UPDATE` na linha da
 * inscrição — o mesmo recurso que o sorteio do balcão já usa para serializar.
 * A segunda confirmação enxerga a primeira e é recusada a quem não tem
 * permissão de reimpressão.
 *
 * A autorização é reavaliada aqui, na hora de concluir, e não herdada da
 * emissão: uma concessão revogada no intervalo precisa valer.
 */
@Injectable()
export class CredentialPrintConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repositorio: OperatorCapabilityRepository,
  ) {}

  async confirmar(
    actorUserId: string,
    eventId: string,
    pedido: PedidoDeConfirmacao,
  ): Promise<ResultadoDaConfirmacao> {
    // Primeira leitura, FORA da transação, apenas para resolver a organização do
    // evento e responder 404 a quem não é membro ativo sem abrir transação.
    // ELA NÃO AUTORIZA NADA: a leitura que autoriza acontece dentro, depois do
    // lock, porque um snapshot anterior à espera não prova nada sobre o
    // instante da escrita.
    const inicial = await this.repositorio.contextoDoAtor(actorUserId, eventId);
    if (!inicial) throw new NotFoundException('Evento não encontrado.');

    const reservationId = this.exigirTexto(pedido?.reservationId, 'Inscrição não informada.');
    const sequence = this.exigirSequencia(pedido?.sequence);

    return this.prisma.$transaction(async (tx) => {
      // Ordem de locks, sempre a mesma: INSCRIÇÃO e depois CONCESSÃO. Conceder e
      // revogar nunca travam a inscrição, logo não existe ciclo entre as duas
      // operações e não há deadlock possível.
      //
      // Trava a inscrição ANTES de contar. Sem isto, duas confirmações
      // concorrentes leem zero concluídas e ambas passam como primeira.
      const travadas = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "EventRegistrationReservation"
        WHERE "id" = ${reservationId}
          AND "eventId" = ${eventId}
          AND "organizationId" = ${inicial.organizationId}
        FOR UPDATE
      `);
      if (travadas.length === 0) throw new NotFoundException('Inscrição não encontrada neste evento.');

      const tentativa = await tx.eventCredentialPrint.findUnique({
        where: {
          eventId_reservationId_kind_sequence: { eventId, reservationId, kind: 'ISSUED', sequence },
        },
        select: { organizationId: true },
      });
      if (!tentativa) throw new NotFoundException('Emissão não encontrada para esta inscrição.');

      const jaConfirmada = await tx.eventCredentialPrint.findUnique({
        where: {
          eventId_reservationId_kind_sequence: { eventId, reservationId, kind: 'CONFIRMED', sequence },
        },
        select: { organizationId: true },
      });

      const concluidas = await tx.eventCredentialPrint.count({
        where: { eventId, reservationId, kind: 'CONFIRMED' },
      });

      // Repetir a confirmação da MESMA tentativa é idempotente, não reimpressão:
      // a conclusão que ela representa já está contada, então exigir
      // `credencial_reimprimir` aqui puniria um reenvio de rede.
      const reimpressao = jaConfirmada ? concluidas > 1 : concluidas > 0;
      const acaoExigida: AcaoDeImpressao = reimpressao
        ? ACAO_DE_IMPRESSAO.repetida
        : ACAO_DE_IMPRESSAO.primeira;

      // Trava em modo compartilhado a concessão que esta confirmação exige. Um
      // revoke concorrente precisa REMOVER esta linha, portanto fica bloqueado
      // até esta transação terminar, em vez de a concessão desaparecer entre a
      // conferência e a escrita. Se a linha não existe, nada é travado —
      // correto, porque aí só um organizador passa, e organizador não depende
      // de concessão.
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "EventOperatorGrant"
        WHERE "eventId" = ${eventId}
          AND "targetUserId" = ${actorUserId}
          AND "action" = ${acaoExigida}
        FOR SHARE
      `);

      // Só agora se autoriza, com papel, capacidades e concessões lidos DENTRO
      // da transação. Revogação, perda de papel ou capacidade desligada durante
      // a espera passam a valer.
      const contexto = await this.repositorio.contextoDoAtor(actorUserId, eventId, tx);
      if (!contexto) throw new NotFoundException('Evento não encontrado.');

      const decisao = decidirAcaoDeOperador({
        papel: contexto.papel,
        acao: acaoExigida,
        organizationId: contexto.organizationId,
        eventId,
        userId: actorUserId,
        capacidadesDoEvento: contexto.capacidadesDoEvento,
        concessoes: contexto.concessoes,
      });
      if (!decisao.permitido) {
        throw new ForbiddenException(
          acaoExigida === 'credencial_reimprimir'
            ? 'Esta credencial já foi impressa. Confirmar outra impressão exige permissão de reimpressão.'
            : 'Sem permissão para confirmar impressão de credencial neste evento.',
        );
      }

      if (jaConfirmada) return { sequence, acaoExigida, concluida: true, repetida: true };

      await tx.eventCredentialPrint.create({
        data: {
          organizationId: tentativa.organizationId,
          eventId,
          reservationId,
          kind: 'CONFIRMED',
          sequence,
          actorUserId,
        },
      });
      return { sequence, acaoExigida, concluida: true, repetida: false };
    });
  }

  // Entrada malformada é 400, não 404: neste ponto quem pede já foi
  // reconhecido como membro ativo da organização do evento, logo não há o que
  // esconder, e devolver "não encontrado" para um campo ausente seria mentir
  // sobre a causa.
  private exigirTexto(valor: unknown, mensagem: string): string {
    if (typeof valor !== 'string' || valor.trim() === '' || valor.length > 60) {
      throw new BadRequestException(mensagem);
    }
    return valor;
  }

  private exigirSequencia(valor: unknown): number {
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > 1_000_000) {
      throw new BadRequestException('Sequência da emissão inválida.');
    }
    return valor;
  }
}
