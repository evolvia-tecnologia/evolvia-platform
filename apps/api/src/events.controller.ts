import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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

  @Get(':eventId')
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.events.get(request.user!.id, eventId);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateEventDto) {
    return this.events.create(request.user!.id, dto);
  }
}
