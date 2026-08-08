import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import {
  AddScientificCommitteeMemberDto,
  AssignScientificPersonRoleDto,
  CreateScientificCommitteeDto,
  CreateScientificPersonDto,
  CreateScientificRoleDto,
  CreateScientificTaxonomyNodeDto,
} from './dto';
import { ScientificStructureService } from './scientific-structure.service';

@UseGuards(AuthGuard)
@Controller('scientific-events')
export class ScientificStructureController {
  constructor(private readonly structure: ScientificStructureService) {}

  @Get(':eventId/structure')
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.structure.get(request.user!.id, eventId);
  }

  @Post(':eventId/structure/people')
  createPerson(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificPersonDto,
  ) {
    return this.structure.createPerson(request.user!.id, eventId, dto);
  }

  @Post(':eventId/structure/roles')
  createRole(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificRoleDto,
  ) {
    return this.structure.createRole(request.user!.id, eventId, dto);
  }

  @Post(':eventId/structure/person-roles')
  assignRole(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: AssignScientificPersonRoleDto,
  ) {
    return this.structure.assignRole(request.user!.id, eventId, dto);
  }

  @Post(':eventId/structure/committees')
  createCommittee(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificCommitteeDto,
  ) {
    return this.structure.createCommittee(request.user!.id, eventId, dto);
  }

  @Post(':eventId/structure/committee-members')
  addCommitteeMember(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: AddScientificCommitteeMemberDto,
  ) {
    return this.structure.addCommitteeMember(request.user!.id, eventId, dto);
  }

  @Post(':eventId/structure/taxonomy')
  createTaxonomyNode(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificTaxonomyNodeDto,
  ) {
    return this.structure.createTaxonomyNode(request.user!.id, eventId, dto);
  }
}
