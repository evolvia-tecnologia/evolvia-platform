import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { AsaasCheckoutService } from './asaas-checkout.service';

@Controller('public/events/:slug/registration/reservations/:protocol')
export class PublicAsaasCheckoutController {
  constructor(private readonly checkout: AsaasCheckoutService) {}

  @Get()
  getStatus(@Param('slug') slug: string, @Param('protocol') protocol: string) {
    return this.checkout.getStatus(slug, protocol);
  }

  @Post('checkout')
  createCheckout(
    @Param('slug') slug: string,
    @Param('protocol') protocol: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.checkout.createCheckout(slug, protocol, idempotencyKey);
  }
}

@Controller('webhooks/asaas')
export class AsaasCheckoutWebhookController {
  constructor(private readonly checkout: AsaasCheckoutService) {}

  @Post('checkout')
  receive(
    @Headers('asaas-access-token') token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.checkout.receiveWebhook(token, body);
  }
}
