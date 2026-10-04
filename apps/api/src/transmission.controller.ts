import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { TransmissionService } from './transmission.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/transmission')
export class TransmissionController {
  constructor(private readonly transmission: TransmissionService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.transmission.get(request.user!.id, eventId);
  }

  @Put()
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.transmission.save(request.user!.id, eventId, input);
  }
}
