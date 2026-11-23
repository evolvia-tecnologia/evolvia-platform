import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventCommunicationBatchService } from './event-communication-batch.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/communication/batches')
export class EventCommunicationBatchController {
  constructor(private readonly batches: EventCommunicationBatchService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.batches.list(request.user!.id, eventId);
  }

  @Post()
  prepare(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() raw: unknown) {
    return this.batches.prepare(request.user!.id, eventId, raw);
  }
}
