import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth.guard';
import {
  CreateEventPublicationSectionDto,
  ReorderEventPublicationSectionsDto,
  RemoveEventPublicationSectionDto,
  TransitionEventPublicationDto,
  UpdateEventPublicationDto,
  UpdateEventPublicationSectionDto,
} from './event-publication.dto';
import { EventPublicationPreviewService } from './event-publication-preview.service';
import { EventPublicationSectionsService } from './event-publication-sections.service';
import { EventPublicationService } from './event-publication.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/publication')
export class EventPublicationController {
  constructor(
    private readonly publication: EventPublicationService,
    private readonly preview: EventPublicationPreviewService,
    private readonly sections: EventPublicationSectionsService,
  ) {}

  @Get()
  getAdmin(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.publication.getAdmin(request.user!.id, eventId);
  }

  @Get('preview')
  getPreview(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.preview.getPreview(request.user!.id, eventId);
  }

  @Patch()
  updateAdmin(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventPublicationDto,
  ) {
    return this.publication.updateAdmin(request.user!.id, eventId, dto);
  }

  @Post('status')
  transitionStatus(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: TransitionEventPublicationDto,
  ) {
    return this.publication.transitionStatus(request.user!.id, eventId, dto);
  }

  @Post('sections')
  createSection(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateEventPublicationSectionDto,
  ) {
    return this.sections.create(request.user!.id, eventId, dto);
  }

  @Patch('sections/:sectionId')
  updateSection(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateEventPublicationSectionDto,
  ) {
    return this.sections.update(request.user!.id, eventId, sectionId, dto);
  }

  @Put('sections/order')
  reorderSections(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: ReorderEventPublicationSectionsDto,
  ) {
    return this.sections.reorder(request.user!.id, eventId, dto);
  }

  @Delete('sections/:sectionId')
  removeSection(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: RemoveEventPublicationSectionDto,
  ) {
    return this.sections.remove(request.user!.id, eventId, sectionId, dto);
  }
}
