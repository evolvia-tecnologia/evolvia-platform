import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { CreateEventDto } from './dto';
import { EventsService } from './events.service';

@UseGuards(AuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}
  @Get() list(@Req() request: AuthenticatedRequest) { return this.events.list(request.user!.id); }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() dto: CreateEventDto) { return this.events.create(request.user!.id, dto); }
}
