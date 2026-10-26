import { Body, Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventCommunicationAudienceService } from './event-communication-audience.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/communication/audience')
export class EventCommunicationAudienceController {
  constructor(private readonly audience: EventCommunicationAudienceService) {}
  @Get('categories')
  categories(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.audience.categories(request.user!.id, eventId);
  }
  @Post('preview')
  preview(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() raw: unknown) {
    return this.audience.preview(request.user!.id, eventId, raw);
  }
}
