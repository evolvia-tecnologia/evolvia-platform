import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { AsaasCheckoutService } from './asaas-checkout.service';

@Controller('public/events/:slug/registration/reservations/:protocol')
export class PublicAsaasCheckoutController {
  constructor(private readonly checkout: AsaasCheckoutService) {}

  @Get()
  getStatus(@Req() request: AccessShieldRequest, @Param('slug') slug: string, @Param('protocol') protocol: string) {
    assertAccessRate(request, 'public-checkout', 20);
    return this.checkout.getStatus(slug, protocol);
  }

  @Post('checkout')
  createCheckout(
    @Req() request: AccessShieldRequest,
    @Param('slug') slug: string,
    @Param('protocol') protocol: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    assertAccessRate(request, 'public-checkout', 20);
    return this.checkout.createCheckout(slug, protocol, idempotencyKey);
  }
}

@Controller('webhooks/asaas')
export class AsaasCheckoutWebhookController {
  constructor(private readonly checkout: AsaasCheckoutService) {}

  @Post('checkout')
  receive(
    @Req() request: AccessShieldRequest,
    @Headers('asaas-access-token') token: string | undefined,
    @Body() body: unknown,
  ) {
    assertAccessRate(request, 'asaas-webhook', 1000);
    return this.checkout.receiveWebhook(token, body);
  }
}
