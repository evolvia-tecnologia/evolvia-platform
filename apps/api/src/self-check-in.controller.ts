import { Body, Controller, Param, Post } from '@nestjs/common';
import { CheckInService } from './check-in.service';

@Controller('public/events/:slug/self-check-in')
export class SelfCheckInController {
  constructor(private readonly checkIns: CheckInService) {}

  @Post()
  enter(@Param('slug') slug: string, @Body() input: { code?: unknown }) {
    return this.checkIns.selfCheckIn(slug, input?.code);
  }
}
