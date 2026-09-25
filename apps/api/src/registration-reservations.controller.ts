import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
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
    @Param('slug') slug: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: PublicRegistrationInput,
  ) {
    return this.reservations.reserve(slug, input, idempotencyKey);
  }
}
