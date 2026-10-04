import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import {
  ConfigureScientificInvitationTemplateDto,
  CreateScientificGuestDto,
  PrepareScientificInvitationDto,
  RespondScientificInvitationDto,
  UpdateScientificGuestDto,
  UpdateScientificInvitationStatusDto,
} from './dto';
import { ScientificGuestsService } from './scientific-guests.service';

@UseGuards(AuthGuard)
@Controller('scientific-events')
export class ScientificGuestsController {
  constructor(private readonly guests: ScientificGuestsService) {}

  @Get(':eventId/guests')
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.guests.get(request.user!.id, eventId);
  }

  @Post(':eventId/guests')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificGuestDto,
  ) {
    return this.guests.create(request.user!.id, eventId, dto);
  }

  @Patch(':eventId/guests/:guestId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('guestId') guestId: string,
    @Body() dto: UpdateScientificGuestDto,
  ) {
    return this.guests.update(request.user!.id, eventId, guestId, dto);
  }

  @Put(':eventId/guest-invitation-template')
  configureTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: ConfigureScientificInvitationTemplateDto,
  ) {
    return this.guests.configureTemplate(request.user!.id, eventId, dto);
  }

  @Post(':eventId/guests/:guestId/prepare-invitation')
  prepareInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('guestId') guestId: string,
    @Body() dto: PrepareScientificInvitationDto,
  ) {
    return this.guests.prepareInvitation(request.user!.id, eventId, guestId, dto);
  }

  @Patch(':eventId/guests/:guestId/invitation-status')
  updateInvitationStatus(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('guestId') guestId: string,
    @Body() dto: UpdateScientificInvitationStatusDto,
  ) {
    return this.guests.updateInvitationStatus(request.user!.id, eventId, guestId, dto);
  }
}

@Controller('scientific-invitations')
export class ScientificInvitationController {
  constructor(private readonly guests: ScientificGuestsService) {}

  @Get(':token')
  get(@Req() request: AccessShieldRequest, @Param('token') token: string) {
    assertAccessRate(request, 'scientific-invitation', 12);
    return this.guests.publicInvitation(token);
  }

  @Post(':token/respond')
  respond(@Req() request: AccessShieldRequest, @Param('token') token: string, @Body() dto: RespondScientificInvitationDto) {
    assertAccessRate(request, 'scientific-invitation', 12);
    return this.guests.respondPublicInvitation(token, dto);
  }
}
