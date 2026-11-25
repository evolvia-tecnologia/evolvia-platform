import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import type { ParticipantAccessInput } from './participant-area-policy';
import { ParticipantDashboardService } from './participant-dashboard.service';

@UseGuards(AuthGuard)
@Controller('participant')
export class ParticipantDashboardController {
  constructor(private readonly dashboard: ParticipantDashboardService) {}

  @Get('me')
  get(@Req() request: AuthenticatedRequest) {
    return this.dashboard.get(request.user!.id);
  }

  @Post('registration/session')
  openRegistration(@Req() request: AccessShieldRequest, @Body() body: ParticipantAccessInput) {
    assertAccessRate(request, 'participant-session', 8);
    return this.dashboard.openRegistration(body);
  }

  @Post('links')
  link(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.dashboard.link(request.user!.id, body);
  }

  @Post('events/:slug/sessions')
  enterEvent(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.dashboard.enterEvent(request.user!.id, slug);
  }

  @Get('history')
  history(@Req() request: AuthenticatedRequest) {
    return this.dashboard.history(request.user!.id);
  }

  @Post('history/recovery')
  requestRecovery(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.dashboard.requestHistoryRecovery(request.user!.id, body);
  }

  @Post('history/recovery/confirm')
  confirmRecovery(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.dashboard.confirmHistoryRecovery(request.user!.id, body);
  }
}
