import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CheckInService } from './check-in.service';

@Controller('public/events/:slug')
export class SelfCheckInController {
  constructor(private readonly checkIns: CheckInService) {}

  @Get('self-service')
  context(@Param('slug') slug: string) {
    return this.checkIns.selfServiceContext(slug);
  }

  @Post('self-service/preview')
  preview(@Param('slug') slug: string, @Body() input: unknown) {
    return this.checkIns.selfServicePreview(slug, input);
  }

  @Post('self-service')
  print(@Param('slug') slug: string, @Body() input: unknown) {
    return this.checkIns.selfServicePrint(slug, input);
  }

  @Post('self-check-in')
  enter(@Param('slug') slug: string, @Body() input: { code?: unknown }) {
    return this.checkIns.selfCheckIn(slug, input?.code);
  }
}
