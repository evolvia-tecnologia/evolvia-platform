import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationNoticeService } from './registration-notice.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-notices')
export class RegistrationNoticeController {
  constructor(private readonly notices: RegistrationNoticeService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.notices.get(request.user!.id, eventId);
  }

  @Post()
  send(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.notices.send(request.user!.id, eventId, input, idempotencyKey);
  }
}
