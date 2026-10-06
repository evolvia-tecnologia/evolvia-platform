import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { PresenceCertificateService } from './presence-certificate.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/certificate')
export class PresenceCertificateController {
  constructor(private readonly certificates: PresenceCertificateService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.certificates.get(request.user!.id, eventId);
  }

  @Put()
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.certificates.save(request.user!.id, eventId, input);
  }
}
