import { Body, Controller, Delete, Get, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { PresenceCertificateService } from './presence-certificate.service';

type ByteResponse = { setHeader(name: string, value: string | number): void; end(body: Buffer): void };

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

  @Post('batches')
  issueBatch(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.certificates.issueBatch(request.user!.id, eventId);
  }

  @Post('art')
  saveArt(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.certificates.saveArt(request.user!.id, eventId, input);
  }

  @Delete('art')
  removeArt(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.certificates.removeArt(request.user!.id, eventId, input);
  }

  @Get('art')
  async readArt(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Res() response: ByteResponse,
  ) {
    const result = await this.certificates.readArt(request.user!.id, eventId);
    this.sendArt(response, result);
  }

  private sendArt(response: ByteResponse, result: { bytes: Buffer; mimeType: string }) {
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Length', result.bytes.length);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    response.end(result.bytes);
  }
}
