import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { CertificateRoleService } from './certificate-role.service';

type ByteResponse = { setHeader(name: string, value: string | number): void; end(body: Buffer): void };

@UseGuards(AuthGuard)
@Controller('events/:eventId/certificate-roles')
export class CertificateRoleController {
  constructor(private readonly roles: CertificateRoleService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.roles.list(request.user!.id, eventId);
  }

  @Put(':role')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('role') role: string,
    @Body() input: unknown,
  ) {
    return this.roles.save(request.user!.id, eventId, role, input);
  }

  @Post(':role/issue')
  issue(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('role') role: string,
    @Body() input?: unknown,
  ) {
    return this.roles.issueEligible(request.user!.id, eventId, role, input);
  }

  @Get(':role/batches')
  batches(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('role') role: string, @Query('beforeId') beforeId?: unknown) {
    return this.roles.listBatches(request.user!.id, eventId, role, beforeId);
  }

  @Get(':role/batches/:batchId/pdf')
  async package(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('role') role: string, @Param('batchId') batchId: string, @Res() response: ByteResponse) {
    const result = await this.roles.batchPdf(request.user!.id, eventId, role, batchId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', result.bytes.length);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'attachment; filename="pacote-certificados.pdf"');
    response.end(result.bytes);
  }
}


