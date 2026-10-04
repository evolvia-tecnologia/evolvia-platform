import { Body, Controller, Get, Post, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationOperationsService } from './registration-operations.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-operations')
export class RegistrationOperationsController {
  constructor(private readonly operations: RegistrationOperationsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query() query: { page?: string; status?: string; protocol?: string; email?: string; document?: string; benefit?: string; payment?: string; company?: string },
  ) {
    return this.operations.list(request.user!.id, eventId, {
      page: query.page, status: query.status, protocol: query.protocol,
    });
  }

  @Post('search')
  search(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() filters: Parameters<RegistrationOperationsService['list']>[2],
  ) {
    return this.operations.list(request.user!.id, eventId, filters);
  }
}
