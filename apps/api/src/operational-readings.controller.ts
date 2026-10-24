import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { OperationalReadingsService } from './operational-readings.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/operational-readings')
export class OperationalReadingsController {
  constructor(private readonly readings: OperationalReadingsService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.readings.get(request.user!.id, eventId);
  }
}
