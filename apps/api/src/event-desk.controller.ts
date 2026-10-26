import { Body, Controller, Get, Header, Headers, Param, Post, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
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

  @Get('report')
  report(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.desk.report(request.user!.id, eventId);
  }

  @Post('raffle')
  raffle(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.draw(request.user!.id, eventId, input);
  }

  @Post('search')
  search(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.search(request.user!.id, eventId, input);
  }

  @Post('check-in')
  checkIn(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.checkInReservation(request.user!.id, eventId, input);
  }

  @Post('check-in/reverse')
  reverseCheckIn(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; reason?: unknown }) {
    return this.desk.reverseCheckIn(request.user!.id, eventId, input);
  }

  @Post('badge')
  badge(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.badge(request.user!.id, eventId, input);
  }

  @Get('kit')
  kit(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.desk.kit(request.user!.id, eventId);
  }

  @Get('kit/report')
  kitReport(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.desk.kitReport(request.user!.id, eventId, query);
  }

  @Get('kit/export')
  @Header('Cache-Control', 'no-store')
  async kitExport(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    const body = await this.desk.exportKitReport(request.user!.id, eventId, query);
    return new StreamableFile(Buffer.from(body, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="relatorio-kits.csv"',
    });
  }

  @Post('kit')
  saveKit(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.saveKit(request.user!.id, eventId, input);
  }

  @Post('material')
  material(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; sizeId?: unknown; confirmSizeChange?: unknown }) {
    return this.desk.deliverMaterial(request.user!.id, eventId, input);
  }

  @Post('material/reverse')
  reverseMaterial(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; reason?: unknown }) {
    return this.desk.reverseMaterial(request.user!.id, eventId, input);
  }

  @Post('day-presence')
  dayPresence(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.markDayPresence(request.user!.id, eventId, input);
  }

  @Post('day-presence/reverse')
  reverseDayPresence(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; reason?: unknown }) {
    return this.desk.reverseDayPresence(request.user!.id, eventId, input);
  }

  @Post('activity-access')
  activity(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; activityId?: unknown }) {
    return this.desk.recordActivityAccess(request.user!.id, eventId, input);
  }

  @Post('label')
  label(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.updateLabel(request.user!.id, eventId, input);
  }

  @Post('self-service')
  selfService(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.updateSelfService(request.user!.id, eventId, input);
  }

  @Post('totem-link')
  issueTotemLink(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.issueTotemLink(request.user!.id, eventId, input);
  }

  @Post('totem-link/revoke')
  revokeTotemLink(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.desk.revokeTotemLink(request.user!.id, eventId);
  }

  @Get('registrations/:reservationId')
  registration(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('reservationId') reservationId: string) {
    return this.desk.registrationRecord(request.user!.id, eventId, reservationId);
  }

  @Post('registrations/:reservationId/corrections')
  correct(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('reservationId') reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: unknown,
  ) {
    return this.desk.correctRegistration(request.user!.id, eventId, reservationId, idempotencyKey, input);
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
