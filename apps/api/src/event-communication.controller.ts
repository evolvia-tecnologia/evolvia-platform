import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventCommunicationService } from './event-communication.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/communication/drafts')
export class EventCommunicationController {
  constructor(private readonly communication: EventCommunicationService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.communication.list(request.user!.id, eventId);
  }

  @Get(':draftId')
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('draftId') draftId: string) {
    return this.communication.get(request.user!.id, eventId, draftId);
  }

  @Put(':draftId')
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('draftId') draftId: string, @Body() body: unknown) {
    return this.communication.save(request.user!.id, eventId, draftId, body);
  }
}
