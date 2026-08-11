import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth.guard';
import { UpdateEventPublicationDto } from './event-publication.dto';
import { EventPublicationService } from './event-publication.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/publication')
export class EventPublicationController {
  constructor(private readonly publication: EventPublicationService) {}

  @Get()
  getAdmin(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.publication.getAdmin(request.user!.id, eventId);
  }

  @Patch()
  updateAdmin(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventPublicationDto,
  ) {
    return this.publication.updateAdmin(request.user!.id, eventId, dto);
  }
}
