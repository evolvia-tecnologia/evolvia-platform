import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationRefundService } from './registration-refund.service';

@Controller('public')
export class RegistrationRefundPublicController {
  constructor(private readonly refunds: RegistrationRefundService) {}

  @Post('integrations/asaas/sandbox/refunds/webhook')
  async sandboxWebhook(@Headers('asaas-access-token') token: string | undefined, @Body() body: unknown) {
    await this.refunds.reconcileSandboxWebhook(token, body);
    return { received: true };
  }

  @Get('events/:slug/refund-policy')
  policy(@Param('slug') slug: string) {
    return this.refunds.publicPolicy(slug);
  }
}

@Controller('public/events/:slug/participant/refund')
export class RegistrationRefundParticipantController {
  constructor(private readonly refunds: RegistrationRefundService) {}

  @Get()
  view(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.refunds.participantView(slug, authorization);
  }

  @Post('requests')
  request(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() input: unknown,
  ) {
    return this.refunds.requestFromSession(slug, authorization, input);
  }
}

@UseGuards(AuthGuard)
@Controller('participant/events/:slug/refund')
export class RegistrationRefundAccountController {
  constructor(private readonly refunds: RegistrationRefundService) {}

  @Get()
  view(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.refunds.accountView(request.user!.id, slug);
  }

  @Post('requests')
  request(@Req() request: AuthenticatedRequest, @Param('slug') slug: string, @Body() input: unknown) {
    return this.refunds.requestFromAccount(request.user!.id, slug, input);
  }
}

@UseGuards(AuthGuard)
@Controller('events/:eventId/refunds')
export class RegistrationRefundOrganizerController {
  constructor(private readonly refunds: RegistrationRefundService) {}

  @Get('policy')
  policy(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.refunds.organizerPolicy(request.user!.id, eventId);
  }

  @Post('policy')
  savePolicy(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.refunds.savePolicy(request.user!.id, eventId, input);
  }

  @Get('requests')
  requests(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.refunds.listRequests(request.user!.id, eventId, { status, cursor });
  }

  @Post('requests/:requestId/preparation')
  prepare(
    @Req() request: AuthenticatedRequest, @Param('eventId') eventId: string,
    @Param('requestId') requestId: string, @Body() input: unknown,
  ) {
    return this.refunds.prepare(request.user!.id, eventId, requestId, input);
  }

  @Post('requests/:requestId/sandbox-payment-reference')
  resolveSandboxPayment(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('requestId') requestId: string) {
    return this.refunds.resolveSandboxPayment(request.user!.id, eventId, requestId);
  }

  @Post('requests/:requestId/sandbox-processing')
  processSandbox(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('requestId') requestId: string) {
    return this.refunds.processSandboxRefund(request.user!.id, eventId, requestId);
  }

  @Post('requests/:requestId/mock-refund')
  simulate(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('requestId') requestId: string) {
    return this.refunds.mockRefund(request.user!.id, eventId, requestId, 'ISSUE');
  }

  @Post('requests/:requestId/mock-reconciliation')
  reconcile(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('requestId') requestId: string) {
    return this.refunds.mockRefund(request.user!.id, eventId, requestId, 'RECONCILE');
  }

  @Post('requests/:requestId/decision')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('requestId') requestId: string,
    @Body() input: unknown,
  ) {
    return this.refunds.decide(request.user!.id, eventId, requestId, input);
  }
}
