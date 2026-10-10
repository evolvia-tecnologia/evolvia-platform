import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationLotDisplayService } from './registration-lot-display.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-lot-display')
export class RegistrationLotDisplayController {
  constructor(private readonly display: RegistrationLotDisplayService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.display.get(request.user!.id, eventId);
  }

  @Put()
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.display.save(request.user!.id, eventId, input);
  }
}
