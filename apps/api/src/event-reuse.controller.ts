import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventReuseService } from './event-reuse.service';

@UseGuards(AuthGuard)
@Controller('events')
export class EventReuseController {
  constructor(private readonly eventReuse: EventReuseService) {}

  @Post(':eventId/reuse')
  reuse(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: unknown,
  ) {
    return this.eventReuse.reuse(request.user!.id, eventId, idempotencyKey, input);
  }
}

