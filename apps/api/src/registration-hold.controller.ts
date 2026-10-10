import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationHoldService } from './registration-hold.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-hold')
export class RegistrationHoldController {
  constructor(private readonly holds: RegistrationHoldService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.holds.get(request.user!.id, eventId);
  }

  @Put()
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.holds.save(request.user!.id, eventId, input);
  }
}
