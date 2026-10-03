import { Body, Controller, Get, Headers, Param, Post, Res } from '@nestjs/common';
import { PublicRegistrationInput } from './registration-reservations-policy';
import { RegistrationReservationsService } from './registration-reservations.service';
import { RegistrationTermsDocumentService } from './registration-terms-document.service';

@Controller('public/events/:slug/registration')
export class RegistrationReservationsController {
  constructor(
    private readonly reservations: RegistrationReservationsService,
    private readonly termsDocuments: RegistrationTermsDocumentService,
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

  @Post('reservations')
  reserve(
    @Param('slug') slug: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: PublicRegistrationInput,
  ) {
    return this.reservations.reserve(slug, input, idempotencyKey);
  }
}
