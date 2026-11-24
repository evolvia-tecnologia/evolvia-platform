import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { CreateEventDto } from './dto';
import { EventsService } from './events.service';

@UseGuards(AuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('organizationId') organizationId?: string) {
    return this.events.list(request.user!.id, organizationId);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateEventDto) {
    return this.events.create(request.user!.id, dto);
  }

  @Patch(':eventId/subject-areas')
  updateSubjectAreas(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: unknown,
  ) {
    return this.events.updateSubjectAreas(request.user!.id, eventId, input);
  }

  /**
   * Agenda de evento JÁ PUBLICADO: datas, fuso e local, e nada mais.
   *
   * Fica fora do Wizard de propósito. O Wizard é a fundação do evento e só
   * aceita rascunho; este comando existe exatamente para o estado em que o
   * Wizard recusa, e por isso não amplia `assertFoundationMutable`.
   *
   * O corpo é lido como `unknown` e validado no serviço, como a rota de áreas
   * de atuação ao lado: a regra de ausente/nulo/inválido por campo não cabe em
   * DTO declarativo sem perder a distinção entre "não mandei" e "quero limpar".
   */
  @Patch(':eventId/schedule')
  updateSchedule(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: unknown,
  ) {
    return this.events.updateSchedule(request.user!.id, eventId, input);
  }
}
