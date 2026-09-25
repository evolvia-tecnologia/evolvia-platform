import { Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { SaveEventOperatorAssignmentDto } from './event-operator-assignments.dto';
import { EventOperatorAssignmentsService } from './event-operator-assignments.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/operator-assignments')
export class EventOperatorAssignmentsController {
  constructor(private readonly assignments: EventOperatorAssignmentsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.assignments.list(request.user!.id, eventId);
  }

  @Put(':userId')
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string,
    @Param('userId') userId: string, @Body() dto: SaveEventOperatorAssignmentDto) {
    return this.assignments.grant(request.user!.id, eventId, userId, dto.permissions, dto.expiresAt);
  }

  @Delete(':userId')
  revoke(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('userId') userId: string) {
    return this.assignments.revoke(request.user!.id, eventId, userId);
  }
}
