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
}
