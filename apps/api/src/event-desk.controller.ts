import { Body, Controller, Get, Header, Headers, Param, Post, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventDeskService } from './event-desk.service';
import { OperatorCapabilityGuard, RotaDoBalcaoMarcada } from './operator-capability.guard';
import { PublicRegistrationInput } from './registration-reservations-policy';
import { RegistrationReservationsService } from './registration-reservations.service';

@UseGuards(AuthGuard, OperatorCapabilityGuard)
@Controller('events/:eventId/desk')
export class EventDeskController {
  constructor(
    private readonly desk: EventDeskService,
    private readonly reservations: RegistrationReservationsService,
  ) {}

  @Get()
  @RotaDoBalcaoMarcada('GET /')
  context(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.desk.context(request.user!.id, eventId);
  }

  @Get('report')
  @RotaDoBalcaoMarcada('GET /report')
  report(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.desk.report(request.user!.id, eventId);
  }

  @Post('raffle')
  @RotaDoBalcaoMarcada('POST /raffle')
  raffle(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.draw(request.user!.id, eventId, input);
  }

  @Post('search')
  @RotaDoBalcaoMarcada('POST /search')
  search(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.search(request.user!.id, eventId, input);
  }

  @Post('check-in')
  @RotaDoBalcaoMarcada('POST /check-in')
  checkIn(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.checkInReservation(request.user!.id, eventId, input);
  }

  @Post('check-in/reverse')
  @RotaDoBalcaoMarcada('POST /check-in/reverse')
  reverseCheckIn(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; reason?: unknown }) {
    return this.desk.reverseCheckIn(request.user!.id, eventId, input);
  }

  @Post('badge')
  @RotaDoBalcaoMarcada('POST /badge')
  badge(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.badge(request.user!.id, eventId, input);
  }

  @Get('kit')
  @RotaDoBalcaoMarcada('GET /kit')
  kit(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.desk.kit(request.user!.id, eventId);
  }

  @Get('kit/report')
  @RotaDoBalcaoMarcada('GET /kit/report')
  kitReport(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.desk.kitReport(request.user!.id, eventId, query);
  }

  @Get('kit/export')
  @RotaDoBalcaoMarcada('GET /kit/export')
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
  @RotaDoBalcaoMarcada('POST /kit')
  saveKit(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.saveKit(request.user!.id, eventId, input);
  }

  @Post('material')
  @RotaDoBalcaoMarcada('POST /material')
  material(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; sizeId?: unknown; confirmSizeChange?: unknown }) {
    return this.desk.deliverMaterial(request.user!.id, eventId, input);
  }

  @Post('material/reverse')
  @RotaDoBalcaoMarcada('POST /material/reverse')
  reverseMaterial(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; reason?: unknown }) {
    return this.desk.reverseMaterial(request.user!.id, eventId, input);
  }

  @Post('day-presence')
  @RotaDoBalcaoMarcada('POST /day-presence')
  dayPresence(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown }) {
    return this.desk.markDayPresence(request.user!.id, eventId, input);
  }

  @Post('day-presence/reverse')
  @RotaDoBalcaoMarcada('POST /day-presence/reverse')
  reverseDayPresence(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; reason?: unknown }) {
    return this.desk.reverseDayPresence(request.user!.id, eventId, input);
  }

  @Post('activity-access')
  @RotaDoBalcaoMarcada('POST /activity-access')
  activity(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: { reservationId?: unknown; activityId?: unknown }) {
    return this.desk.recordActivityAccess(request.user!.id, eventId, input);
  }

  @Post('labels/categories/:categoryId')
  @RotaDoBalcaoMarcada('POST /labels/categories/:categoryId')
  saveCategoryLabel(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('categoryId') categoryId: string,
    @Body() input: unknown,
  ) {
    return this.desk.updateCategoryLabel(request.user!.id, eventId, categoryId, input);
  }

  @Post('label')
  @RotaDoBalcaoMarcada('POST /label')
  label(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.updateLabel(request.user!.id, eventId, input);
  }

  @Post('self-service')
  @RotaDoBalcaoMarcada('POST /self-service')
  selfService(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.updateSelfService(request.user!.id, eventId, input);
  }

  @Post('totem-link')
  @RotaDoBalcaoMarcada('POST /totem-link')
  issueTotemLink(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.desk.issueTotemLink(request.user!.id, eventId, input);
  }

  @Post('totem-link/revoke')
  @RotaDoBalcaoMarcada('POST /totem-link/revoke')
  revokeTotemLink(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.desk.revokeTotemLink(request.user!.id, eventId);
  }

  @Get('registrations/:reservationId')
  @RotaDoBalcaoMarcada('GET /registrations/:reservationId')
  registration(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('reservationId') reservationId: string) {
    return this.desk.registrationRecord(request.user!.id, eventId, reservationId);
  }

  @Post('registrations/:reservationId/corrections')
  @RotaDoBalcaoMarcada('POST /registrations/:reservationId/corrections')
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
  @RotaDoBalcaoMarcada('POST /registrations')
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
