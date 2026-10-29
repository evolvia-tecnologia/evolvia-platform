import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { AsaasCheckoutService } from './asaas-checkout.service';
import { RegistrationOrderCheckoutService } from './registration-order-checkout.service';
import { authorizeAsaasCheckoutWebhook, normalizeAsaasCheckoutWebhook } from './asaas-checkout-policy';

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

@Controller('public/events/:slug/registration/orders/:orderId')
export class PublicRegistrationOrderCheckoutController {
  constructor(private readonly grouped: RegistrationOrderCheckoutService) {}

  @Get()
  getStatus(
    @Req() request: AccessShieldRequest, @Param('slug') slug: string,
    @Param('orderId') orderId: string, @Headers('idempotency-key') key: string | undefined,
  ) {
    assertAccessRate(request, 'public-checkout', 20);
    return this.grouped.getStatus(slug, orderId, key);
  }

  @Post('checkout')
  createCheckout(
    @Req() request: AccessShieldRequest, @Param('slug') slug: string,
    @Param('orderId') orderId: string, @Headers('idempotency-key') key: string | undefined,
  ) {
    assertAccessRate(request, 'public-checkout', 20);
    return this.grouped.create(slug, orderId, key);
  }
}

@Controller('webhooks/asaas')
export class AsaasCheckoutWebhookController {
  constructor(private readonly checkout: AsaasCheckoutService, private readonly grouped: RegistrationOrderCheckoutService) {}

  @Post('checkout')
  async receive(
    @Req() request: AccessShieldRequest,
    @Headers('asaas-access-token') token: string | undefined,
    @Body() body: unknown,
  ) {
    assertAccessRate(request, 'asaas-webhook', 1000);
    if (!authorizeAsaasCheckoutWebhook(token)) throw new UnauthorizedException('Webhook não autorizado.');
    let event;
    try { event = normalizeAsaasCheckoutWebhook(body); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Webhook inválido.'); }
    if (await this.grouped.ownsProviderCheckout(event.externalCheckoutId)) {
      return this.grouped.receiveWebhook(token, body);
    }
    // An early grouped webhook is queued by the existing single-checkout inbox.
    // The grouped service replays it after persisting the provider checkout ID.
    return this.checkout.receiveWebhook(token, body);
  }
}
