import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { PublicRegistrationInput } from './registration-reservations-policy';
import { RegistrationWaitlistService } from './registration-waitlist.service';

@UseGuards(AuthGuard)
@Controller()
export class RegistrationWaitlistController {
  constructor(private readonly waitlist: RegistrationWaitlistService) {}

  @Get('participant/events/:slug/waitlist')
  state(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.waitlist.participantState(request.user!.id, slug);
  }

  @Post('participant/events/:slug/waitlist')
  join(@Req() request: AuthenticatedRequest, @Param('slug') slug: string, @Body() body: unknown) {
    return this.waitlist.join(request.user!.id, slug, body);
  }

  @Delete('participant/events/:slug/waitlist/:lotId')
  leave(@Req() request: AuthenticatedRequest, @Param('slug') slug: string, @Param('lotId') lotId: string) {
    return this.waitlist.leave(request.user!.id, slug, lotId);
  }

  @Get('participant/events/:slug/waitlist/:lotId/offer')
  offer(@Req() request: AuthenticatedRequest, @Param('slug') slug: string, @Param('lotId') lotId: string) {
    return this.waitlist.offerOptions(request.user!.id, slug, lotId);
  }

  @Post('participant/events/:slug/waitlist/:lotId/accept')
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('slug') slug: string,
    @Param('lotId') lotId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: PublicRegistrationInput,
  ) {
    return this.waitlist.accept(request.user!.id, slug, lotId, input, idempotencyKey);
  }

  @Get('events/:eventId/registration-waitlist')
  overview(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.waitlist.organizerOverview(request.user!.id, eventId);
  }

  @Patch('events/:eventId/registration-waitlist/lots/:lotId')
  configure(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('lotId') lotId: string,
    @Body() body: unknown,
  ) {
    return this.waitlist.configure(request.user!.id, eventId, lotId, body);
  }

  @Post('events/:eventId/registration-waitlist/promote')
  promote(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.waitlist.promote(request.user!.id, eventId, body, idempotencyKey);
  }
}
