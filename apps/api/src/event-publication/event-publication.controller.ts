import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth.guard';
import {
  CreateEventPublicationSectionDto,
  ReorderEventPublicationSectionsDto,
  RemoveEventPublicationSectionDto,
  RemoveEventPublicationMediaDto,
  TransitionEventPublicationDto,
  UpdateEventPublicationDto,
  UpdateEventPublicationSectionDto,
  UploadEventPublicationMediaDto,
} from './event-publication.dto';
import { EVENT_MEDIA_USAGES, EventMediaUsageValue } from './event-publication-media.policy';
import { EventPublicationMediaService } from './event-publication-media.service';
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
    private readonly media: EventPublicationMediaService,
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

  @Post('media')
  uploadMedia(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: UploadEventPublicationMediaDto,
  ) {
    return this.media.upload(request.user!.id, eventId, dto);
  }

  @Get('media')
  listMedia(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.media.listAdmin(request.user!.id, eventId);
  }

  @Get('media/:usage')
  async getMedia(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('usage') rawUsage: string,
    @Res() response: { setHeader(name: string, value: string | number): void; end(body: Buffer): void },
  ) {
    const usage = this.mediaUsage(rawUsage);
    const result = await this.media.readAdmin(request.user!.id, eventId, usage);
    response.setHeader('Content-Type', result.row.mimeType);
    response.setHeader('Content-Length', result.bytes.length);
    response.setHeader('Cache-Control', result.cacheControl);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    response.end(result.bytes);
  }

  @Delete('media/:usage')
  removeMedia(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('usage') rawUsage: string,
    @Body() dto: RemoveEventPublicationMediaDto,
  ) {
    return this.media.remove(request.user!.id, eventId, this.mediaUsage(rawUsage), dto);
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

  private mediaUsage(rawUsage: string): EventMediaUsageValue {
    if (!EVENT_MEDIA_USAGES.includes(rawUsage as EventMediaUsageValue)) {
      throw new NotFoundException('Mídia não encontrada.');
    }
    return rawUsage as EventMediaUsageValue;
  }
}
