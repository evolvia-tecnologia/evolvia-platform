import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ActivityPreferenceService } from './activity-preference.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/activity-preferences')
export class ActivityPreferenceController {
  constructor(private readonly preferences: ActivityPreferenceService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.preferences.list(request.user!.id, eventId);
  }

  @Post(':enrollmentId/confirm')
  confirm(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('enrollmentId') enrollmentId: string,
  ) {
    return this.preferences.confirm(request.user!.id, eventId, enrollmentId);
  }

  @Post(':enrollmentId/decline')
  decline(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('enrollmentId') enrollmentId: string,
  ) {
    return this.preferences.decline(request.user!.id, eventId, enrollmentId);
  }
}
