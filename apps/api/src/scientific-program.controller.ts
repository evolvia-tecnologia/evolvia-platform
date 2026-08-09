import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import {
  AddScientificProgramParticipantDto,
  CreateScientificProgramActivityDto,
  CreateScientificProgramSpaceDto,
  UpdateScientificProgramActivityDto,
  UpdateScientificProgramSpaceDto,
} from './dto';
import { ScientificProgramService } from './scientific-program.service';

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/program')
export class ScientificProgramController {
  constructor(private readonly program: ScientificProgramService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.program.get(request.user!.id, eventId);
  }

  @Get('conflicts')
  conflicts(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.program.conflicts(request.user!.id, eventId);
  }

  @Post('spaces')
  createSpace(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificProgramSpaceDto,
  ) {
    return this.program.createSpace(request.user!.id, eventId, dto);
  }

  @Patch('spaces/:spaceId')
  updateSpace(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('spaceId') spaceId: string,
    @Body() dto: UpdateScientificProgramSpaceDto,
  ) {
    return this.program.updateSpace(request.user!.id, eventId, spaceId, dto);
  }

  @Post('activities')
  createActivity(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificProgramActivityDto,
  ) {
    return this.program.createActivity(request.user!.id, eventId, dto);
  }

  @Patch('activities/:activityId')
  updateActivity(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateScientificProgramActivityDto,
  ) {
    return this.program.updateActivity(request.user!.id, eventId, activityId, dto);
  }

  @Post('activities/:activityId/participants')
  addParticipant(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('activityId') activityId: string,
    @Body() dto: AddScientificProgramParticipantDto,
  ) {
    return this.program.addParticipant(request.user!.id, eventId, activityId, dto);
  }

  @Delete('activities/:activityId/participants/:participantId')
  removeParticipant(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('activityId') activityId: string,
    @Param('participantId') participantId: string,
  ) {
    return this.program.removeParticipant(request.user!.id, eventId, activityId, participantId);
  }

  @Post('activities/:activityId/ready-for-review')
  markReady(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.program.markReadyForReview(request.user!.id, eventId, activityId);
  }
}
