import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationOperationsService } from './registration-operations.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-operations')
export class RegistrationOperationsController {
  constructor(private readonly operations: RegistrationOperationsService) {}

  @Post('search')
  search(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.operations.search(request.user!.id, eventId, input);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query() query: { page?: string; status?: string; protocol?: string },
  ) {
    return this.operations.list(request.user!.id, eventId, query);
  }
}
