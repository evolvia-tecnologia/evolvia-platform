import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { UpdateScientificCentralBlockDto } from './dto';
import { ScientificEventCentralService } from './scientific-event-central.service';

@UseGuards(AuthGuard)
@Controller('scientific-events')
export class ScientificEventCentralController {
  constructor(private readonly central: ScientificEventCentralService) {}

  @Get(':eventId/central')
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.central.get(request.user!.id, eventId);
  }

  @Patch(':eventId/central')
  updateBlock(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateScientificCentralBlockDto,
  ) {
    return this.central.updateBlock(request.user!.id, eventId, dto);
  }
}
