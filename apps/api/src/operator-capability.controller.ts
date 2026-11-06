import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { OperatorCapabilityService } from './operator-capability.service';

/**
 * Gestão das permissões de operador por evento, para o organizador.
 *
 * Fora de `events/:eventId/desk` de propósito: estas rotas não são operação de
 * balcão, são governança de permissão, e portanto NÃO passam pelo
 * `OperatorCapabilityGuard` — quem as guarda é o próprio service, que exige
 * organizador. Pôr o guard do balcão aqui seria circular: ninguém conseguiria
 * conceder a primeira permissão.
 */
@UseGuards(AuthGuard)
@Controller('events/:eventId/operators')
export class OperatorCapabilityController {
  constructor(private readonly capacidades: OperatorCapabilityService) {}

  @Get()
  painel(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.capacidades.painel(request.user!.id, eventId);
  }

  /**
   * Autoatendimento: o operador pergunta o que ELE pode fazer.
   *
   * Exceção consciente à regra da classe acima — esta é a única rota daqui
   * que não exige organizador, e há um teste que PRENDE isso: se alguma rota
   * nova deste controller deixar de exigir organizador sem estar nesta lista, o
   * teste reprova. O invariante da classe fica verificado por máquina, em vez
   * de confiado à leitura do comentário.
   */
  @Get('me/capabilities')
  minhasAcoes(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.capacidades.minhasAcoes(request.user!.id, eventId);
  }

  @Get('history')
  historico(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query('limite') limite?: string,
  ) {
    return this.capacidades.historico(request.user!.id, eventId, limite);
  }

  @Post(':userId/grants')
  conceder(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('userId') userId: string,
    @Body() input: unknown,
  ) {
    return this.capacidades.conceder(request.user!.id, eventId, userId, input);
  }

  @Post(':userId/grants/revoke')
  revogar(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('userId') userId: string,
    @Body() input: unknown,
  ) {
    return this.capacidades.revogar(request.user!.id, eventId, userId, input);
  }
}
