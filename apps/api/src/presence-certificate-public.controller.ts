import { Controller, Get, Param, Req } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { PresenceCertificateService } from './presence-certificate.service';

@Controller('public/certificates')
export class PresenceCertificatePublicController {
  constructor(private readonly certificates: PresenceCertificateService) {}

  @Get(':code')
  view(@Req() request: AccessShieldRequest, @Param('code') code: string) {
    assertAccessRate(request, 'certificate-verify', 30);
    return this.certificates.publicView(code);
  }
}
