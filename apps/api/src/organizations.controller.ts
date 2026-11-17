import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AddOrganizationMemberDto, CreateOrganizationDto, UpdateMembershipRoleDto } from './dto';
import { SaveOrganizationLegalProfileDto } from './organization-legal.dto';
import { OrganizationsService } from './organizations.service';

@UseGuards(AuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.organizations.list(request.user!.id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateOrganizationDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.organizations.create(request.user!.id, dto, idempotencyKey);
  }

  @Get(':organizationId/legal-profile')
  getLegalProfile(@Req() request: AuthenticatedRequest, @Param('organizationId') organizationId: string) {
    return this.organizations.getLegalProfile(request.user!.id, organizationId);
  }

  @Put(':organizationId/legal-profile')
  saveLegalProfile(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId') organizationId: string,
    @Body() dto: SaveOrganizationLegalProfileDto,
  ) {
    return this.organizations.saveLegalProfile(request.user!.id, organizationId, dto);
  }

  @Get(':organizationId/members')
  listMembers(@Req() request: AuthenticatedRequest, @Param('organizationId') organizationId: string) {
    return this.organizations.listMembers(request.user!.id, organizationId);
  }

  @Post(':organizationId/members')
  addMember(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId') organizationId: string,
    @Body() dto: AddOrganizationMemberDto,
  ) {
    return this.organizations.addMember(request.user!.id, organizationId, dto);
  }

  @Patch(':organizationId/members/:membershipId/role')
  updateRole(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMembershipRoleDto,
  ) {
    return this.organizations.updateRole(request.user!.id, organizationId, membershipId, dto);
  }

  @Delete(':organizationId/members/:membershipId')
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.organizations.removeMember(request.user!.id, organizationId, membershipId);
  }
}
