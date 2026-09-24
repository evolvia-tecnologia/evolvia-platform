import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { SaveEventFinancialResponsibilityDto } from './event-financial-responsibility.dto';
import { EventFinancialResponsibilityService } from './event-financial-responsibility.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/financial-responsibility')
export class EventFinancialResponsibilityController {
  constructor(private readonly responsibility: EventFinancialResponsibilityService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.responsibility.get(request.user!.id, eventId);
  }

  @Put()
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() dto: SaveEventFinancialResponsibilityDto) {
    return this.responsibility.save(request.user!.id, eventId, dto);
  }
}
