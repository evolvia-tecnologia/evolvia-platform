import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';

@Controller('v1/events/:slug/turnstile')
export class TurnstileController {
  constructor(private readonly turnstile: TurnstileService) {}

  @Get('tickets')
  tickets(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('cursor') cursor?: string,
  ) {
    return this.turnstile.listTickets(slug, authorization, cursor);
  }

  @Post('entries')
  entries(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() input: { code?: unknown },
  ) {
    return this.turnstile.validateEntry(slug, authorization, input);
  }
}
