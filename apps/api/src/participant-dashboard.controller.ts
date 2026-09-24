import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ParticipantDashboardService } from './participant-dashboard.service';

@UseGuards(AuthGuard)
@Controller('participant')
export class ParticipantDashboardController {
  constructor(private readonly dashboard: ParticipantDashboardService) {}

  @Get('me')
  get(@Req() request: AuthenticatedRequest) {
    return this.dashboard.get(request.user!.id);
  }

  @Post('links')
  link(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.dashboard.link(request.user!.id, body);
  }

  @Post('events/:slug/sessions')
  enterEvent(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.dashboard.enterEvent(request.user!.id, slug);
  }
}
