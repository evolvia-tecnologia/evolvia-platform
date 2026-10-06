import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { ParticipantAccessInput } from './participant-area-policy';
import { ParticipantAgendaService } from './participant-agenda.service';
import { ParticipantAreaService } from './participant-area.service';

@Controller('public/events/:slug/participant')
export class ParticipantAreaController {
  constructor(
    private readonly participantArea: ParticipantAreaService,
    private readonly agenda: ParticipantAgendaService,
  ) {}

  @Get('agenda')
  agendaView(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.agenda.get(slug, authorization);
  }

  @Post('agenda/:activityId')
  enroll(
    @Param('slug') slug: string,
    @Param('activityId') activityId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.agenda.enroll(slug, authorization, activityId);
  }

  @Delete('agenda/:activityId')
  cancelEnrollment(
    @Param('slug') slug: string,
    @Param('activityId') activityId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.agenda.cancel(slug, authorization, activityId);
  }

  @Post('sessions')
  createSession(@Req() request: AccessShieldRequest, @Param('slug') slug: string, @Body() input: ParticipantAccessInput) {
    assertAccessRate(request, 'participant-session', 8);
    return this.participantArea.createSession(slug, input);
  }

  @Get('me')
  getArea(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.participantArea.getArea(slug, authorization);
  }

  @Get('registration')
  getRegistration(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.participantArea.getEditableRegistration(slug, authorization);
  }

  @Patch('registration')
  updateRegistration(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: unknown,
  ) {
    return this.participantArea.updateEditableRegistration(slug, authorization, idempotencyKey, input);
  }

  @Delete('sessions/current')
  revoke(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.participantArea.revoke(slug, authorization);
  }
}
