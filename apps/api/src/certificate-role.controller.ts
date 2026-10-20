import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { CertificateRoleService } from './certificate-role.service';

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
  ) {
    return this.roles.issueEligible(request.user!.id, eventId, role);
  }
}

