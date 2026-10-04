import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ShowOperationsService } from './show-operations.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/show-operations')
export class ShowOperationsController {
  constructor(private readonly showOperations: ShowOperationsService) {}

  @Get()
  report(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.showOperations.report(request.user!.id, eventId);
  }

  @Get('tickets')
  tickets(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query('page') page?: string,
    @Query('status') status?: string,
    @Query('validation') validation?: string,
  ) {
    return this.showOperations.listTickets(request.user!.id, eventId, { page, status, validation });
  }

  @Post('staff')
  createStaff(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: { displayName?: unknown; duty?: unknown },
  ) {
    return this.showOperations.createStaff(request.user!.id, eventId, input);
  }

  @Post('staff/:credentialId/revoke')
  revokeStaff(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('credentialId') credentialId: string,
  ) {
    return this.showOperations.revokeStaff(request.user!.id, eventId, credentialId);
  }

  @Post('turnstile-keys')
  createTurnstileKey(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: { label?: unknown; shareName?: unknown; shareTicketType?: unknown; shareStatus?: unknown; shareCode?: unknown },
  ) {
    return this.showOperations.createTurnstileKey(request.user!.id, eventId, input);
  }

  @Post('turnstile-keys/:keyId/revoke')
  revokeTurnstileKey(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.showOperations.revokeTurnstileKey(request.user!.id, eventId, keyId);
  }
}
