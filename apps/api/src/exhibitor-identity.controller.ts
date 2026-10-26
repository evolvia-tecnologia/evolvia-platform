import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { ExhibitorIdentityService } from './exhibitor-identity.service';

@Controller('public/events/:slug/exhibitor-identity')
export class ExhibitorIdentityController {
  constructor(private readonly identity: ExhibitorIdentityService) {}

  @Get()
  read(@Req() request: AccessShieldRequest, @Param('slug') slug: string) {
    assertAccessRate(request, 'exhibitor-identity', 120);
    return this.identity.forSlug(slug);
  }

  @Get('logo')
  async logo(
    @Req() request: AccessShieldRequest,
    @Param('slug') slug: string,
    @Res() response: { setHeader(name: string, value: string | number): void; end(body: Buffer): void },
  ) {
    assertAccessRate(request, 'exhibitor-identity-logo', 240);
    const result = await this.identity.logo(slug);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Length', result.bytes.length);
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    response.end(result.bytes);
  }
}
