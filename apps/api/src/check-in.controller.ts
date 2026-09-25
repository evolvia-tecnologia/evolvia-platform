import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { CheckInService } from './check-in.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/check-in')
export class CheckInController {
  constructor(private readonly checkInService: CheckInService) {}

  @Post()
  checkIn(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { code?: unknown }) {
    return this.checkInService.checkIn(request.user!.id, eventId, input);
  }
}
