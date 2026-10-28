import { Controller, Delete, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { ActivityWaitlistService } from './activity-waitlist.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';

@Controller('public/events/:slug/participant/activity-waitlist')
export class ActivityWaitlistParticipantController {
  constructor(private readonly waitlist: ActivityWaitlistService) {}

  @Get()
  view(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.waitlist.view(slug, authorization);
  }

  @Post(':activityId')
  join(
    @Req() request: AccessShieldRequest,
    @Param('slug') slug: string,
    @Param('activityId') activityId: string,
    @Headers('authorization') authorization?: string,
  ) {
    assertAccessRate(request, 'activity-waitlist-join', 8);
    return this.waitlist.join(slug, authorization, activityId);
  }

  @Delete(':activityId')
  leave(
    @Req() request: AccessShieldRequest,
    @Param('slug') slug: string,
    @Param('activityId') activityId: string,
    @Headers('authorization') authorization?: string,
  ) {
    assertAccessRate(request, 'activity-waitlist-leave', 8);
    return this.waitlist.leave(slug, authorization, activityId);
  }
}

@UseGuards(AuthGuard)
@Controller()
export class ActivityWaitlistOrganizerController {
  constructor(private readonly waitlist: ActivityWaitlistService) {}

  @Get('events/:eventId/activity-waitlist')
  overview(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.waitlist.organizer(request.user!.id, eventId);
  }

  @Post('events/:eventId/activity-waitlist/:entryId/promote')
  promote(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.waitlist.promote(request.user!.id, eventId, entryId);
  }
}
