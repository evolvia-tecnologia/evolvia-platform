import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ActivityTransmissionService } from './activity-transmission.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/activity-transmissions')
export class ActivityTransmissionController {
  constructor(private readonly transmissions: ActivityTransmissionService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.transmissions.list(request.user!.id, eventId);
  }

  @Put(':activityId')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('activityId') activityId: string,
    @Body() input: unknown,
  ) {
    return this.transmissions.save(request.user!.id, eventId, activityId, input);
  }
}
