import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { SaveEventWizardDto, StartEventWizardDto } from './dto';
import { EventWizardService } from './event-wizard.service';

@UseGuards(AuthGuard)
@Controller('event-wizard')
export class EventWizardController {
  constructor(private readonly wizard: EventWizardService) {}

  @Post('start')
  start(@Req() request: AuthenticatedRequest, @Body() dto: StartEventWizardDto) {
    return this.wizard.start(request.user!.id, dto);
  }

  @Get(':eventId')
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.wizard.get(request.user!.id, eventId);
  }

  @Patch(':eventId')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: SaveEventWizardDto,
  ) {
    return this.wizard.save(request.user!.id, eventId, dto);
  }

  @Post(':eventId/complete')
  complete(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: SaveEventWizardDto,
  ) {
    return this.wizard.complete(request.user!.id, eventId, dto);
  }
}
