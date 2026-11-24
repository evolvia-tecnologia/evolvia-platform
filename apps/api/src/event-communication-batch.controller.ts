import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { EventCommunicationDispatchService } from './event-communication-dispatch.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventCommunicationBatchService } from './event-communication-batch.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/communication/batches')
export class EventCommunicationBatchController {
  constructor(private readonly batches: EventCommunicationBatchService, private readonly dispatcher: EventCommunicationDispatchService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.batches.list(request.user!.id, eventId);
  }

  @Post(':batchId/start')
  start(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.dispatcher.start(request.user!.id, eventId, batchId);
  }

  @Post(':batchId/cancel')
  cancel(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.batches.cancel(request.user!.id, eventId, batchId);
  }

  @Post()
  prepare(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() raw: unknown) {
    return this.batches.prepare(request.user!.id, eventId, raw);
  }
}
