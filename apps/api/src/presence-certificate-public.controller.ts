import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { PresenceCertificateService } from './presence-certificate.service';

type ByteResponse = { setHeader(name: string, value: string | number): void; end(body: Buffer): void };

@Controller('public/certificates')
export class PresenceCertificatePublicController {
  constructor(private readonly certificates: PresenceCertificateService) {}

  @Get(':code/art')
  async art(@Req() request: AccessShieldRequest, @Param('code') code: string, @Res() response: ByteResponse) {
    assertAccessRate(request, 'certificate-verify', 30);
    const result = await this.certificates.publicArt(code);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Length', result.bytes.length);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    response.end(result.bytes);
  }

  @Get(':code')
  view(@Req() request: AccessShieldRequest, @Param('code') code: string) {
    assertAccessRate(request, 'certificate-verify', 30);
    return this.certificates.publicView(code);
  }
}
