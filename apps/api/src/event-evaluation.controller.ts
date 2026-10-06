import { Body, Controller, Get, Headers, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventEvaluationService } from './event-evaluation.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/evaluation')
export class EventEvaluationOrganizerController {
  constructor(private readonly evaluations: EventEvaluationService) {}

  @Get()
  management(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.evaluations.management(request.user!.id, eventId);
  }

  @Put()
  configure(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() body: unknown) {
    return this.evaluations.configure(request.user!.id, eventId, body);
  }

  @Get('responses')
  responses(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.evaluations.responses(request.user!.id, eventId);
  }
}

@Controller('public/events/:slug/participant/evaluation')
export class EventEvaluationParticipantController {
  constructor(private readonly evaluations: EventEvaluationService) {}

  @Get()
  questionnaire(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.evaluations.questionnaire(slug, authorization);
  }

  @Put()
  answer(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.evaluations.answer(slug, authorization, idempotencyKey, body);
  }
}
