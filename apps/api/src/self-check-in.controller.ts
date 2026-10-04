import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CheckInService } from './check-in.service';

function readAccess(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new NotFoundException('Este link de autoatendimento não é válido.');
  return value;
}

@Controller('public/events/:slug')
export class SelfCheckInController {
  constructor(private readonly checkIns: CheckInService) {}

  @Get('self-service/access/:token')
  accessContext(@Param('slug') slug: string, @Param('token') token: string) {
    return this.checkIns.selfServiceContext(slug, token);
  }

  @Get('self-service')
  context(@Param('slug') slug: string) {
    return this.checkIns.selfServiceContext(slug);
  }

  @Post('self-service/preview')
  preview(@Param('slug') slug: string, @Query('acesso') acesso: unknown, @Body() input: unknown) {
    return this.checkIns.selfServicePreview(slug, input, readAccess(acesso));
  }

  @Post('self-service')
  print(@Param('slug') slug: string, @Query('acesso') acesso: unknown, @Body() input: unknown) {
    return this.checkIns.selfServicePrint(slug, input, readAccess(acesso));
  }

  @Post('self-check-in')
  enter(@Param('slug') slug: string, @Body() input: { code?: unknown }) {
    return this.checkIns.selfCheckIn(slug, input?.code);
  }
}
