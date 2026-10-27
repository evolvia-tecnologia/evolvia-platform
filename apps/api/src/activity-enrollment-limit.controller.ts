import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ActivityEnrollmentLimitService } from './activity-enrollment-limit.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/activity-enrollment-limit')
export class ActivityEnrollmentLimitController {
  constructor(private readonly limits: ActivityEnrollmentLimitService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.limits.get(request.user!.id, eventId);
  }

  @Put()
  save(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: unknown,
  ) {
    return this.limits.save(request.user!.id, eventId, input);
  }
}
