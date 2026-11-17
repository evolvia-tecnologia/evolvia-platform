import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ActivityCourtesyService } from './activity-courtesy.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/activity-courtesy')
export class ActivityCourtesyController {
  constructor(private readonly courtesy: ActivityCourtesyService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.courtesy.get(request.user!.id, eventId);
  }

  @Put()
  save(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: unknown,
  ) {
    return this.courtesy.save(request.user!.id, eventId, input);
  }
}
