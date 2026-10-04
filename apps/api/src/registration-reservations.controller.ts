import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { PublicRegistrationInput } from './registration-reservations-policy';
import { RegistrationReservationsService } from './registration-reservations.service';

@Controller('public/events/:slug/registration')
export class RegistrationReservationsController {
  constructor(private readonly reservations: RegistrationReservationsService) {}

  @Get()
  getOptions(@Param('slug') slug: string) {
    return this.reservations.getOptions(slug);
  }

  @Post('reservations')
  reserve(
    @Req() request: AccessShieldRequest,
    @Param('slug') slug: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: PublicRegistrationInput,
  ) {
    assertAccessRate(request, 'public-reservation', 12);
    return this.reservations.reserve(slug, input, idempotencyKey);
  }
}
