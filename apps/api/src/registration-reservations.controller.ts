import { Body, Controller, Get, Headers, Param, Post, Res } from '@nestjs/common';
import { PublicRegistrationInput } from './registration-reservations-policy';
import { PublicRegistrationOrderInput } from './registration-order-policy';
import { RegistrationCategoryProofService } from './registration-category-proof.service';
import { RegistrationReservationsService } from './registration-reservations.service';
import { RegistrationTermsDocumentService } from './registration-terms-document.service';

@Controller('public/events/:slug/registration')
export class RegistrationReservationsController {
  constructor(
    private readonly reservations: RegistrationReservationsService,
    private readonly termsDocuments: RegistrationTermsDocumentService,
    private readonly categoryProofs: RegistrationCategoryProofService,
  ) {}

  @Get()
  getOptions(@Param('slug') slug: string) {
    return this.reservations.getOptions(slug);
  }

  @Get('terms')
  async terms(
    @Param('slug') slug: string,
    @Res() response: { setHeader(name: string, value: string | number): void; end(body: Buffer): void },
  ) {
    const result = await this.termsDocuments.readPublic(slug);
    const headers = this.termsDocuments.headers();
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.setHeader('Content-Length', result.bytes.length);
    response.end(result.bytes);
  }

  // Somente prévia: nenhuma inscrição ou pagamento é criado nesta rota.
  @Post('orders/preview')
  previewOrder(@Param('slug') slug: string, @Body() input: PublicRegistrationOrderInput) {
    return this.reservations.previewOrder(slug, input);
  }

  @Post('reservations')
  reserve(
    @Param('slug') slug: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: PublicRegistrationInput,
  ) {
    return this.reservations.reserve(slug, input, idempotencyKey);
  }

  @Post('reservations/:protocol/category-proof')
  attachCategoryProof(
    @Param('slug') slug: string,
    @Param('protocol') protocol: string,
    @Body() input: unknown,
  ) {
    return this.categoryProofs.attach(slug, protocol, input);
  }
}
