import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventDeskService } from './event-desk.service';
import { PublicRegistrationInput } from './registration-reservations-policy';
import { RegistrationReservationsService } from './registration-reservations.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/desk')
export class EventDeskController {
  constructor(
    private readonly desk: EventDeskService,
    private readonly reservations: RegistrationReservationsService,
  ) {}

  @Get()
  context(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.desk.context(request.user!.id, eventId);
  }

  @Post('search')
  search(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.search(request.user!.id, eventId, input);
  }

  @Post('check-in')
  checkIn(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.checkInReservation(request.user!.id, eventId, input);
  }

  @Post('badge')
  badge(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.badge(request.user!.id, eventId, input);
  }

  @Post('material')
  material(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.deliverMaterial(request.user!.id, eventId, input);
  }

  @Post('activity-access')
  activity(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; activityId?: unknown }) {
    return this.desk.recordActivityAccess(request.user!.id, eventId, input);
  }

  @Post('self-service')
  selfService(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.updateSelfService(request.user!.id, eventId, input);
  }

  @Post('registrations')
  async register(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: PublicRegistrationInput,
  ) {
    const target = await this.desk.registrationTarget(request.user!.id, eventId);
    return this.reservations.reserve(target.slug, input, idempotencyKey, { actorUserId: request.user!.id, desk: true });
  }
}
