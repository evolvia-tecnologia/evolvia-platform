import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { EventFormat } from '@prisma/client';
import { EventPublicationPublicService } from './event-publication-public.service';
import { EVENT_MEDIA_USAGES, EventMediaUsageValue } from './event-publication-media.policy';
import { EventPublicationMediaService } from './event-publication-media.service';

@Controller('public/events')
export class EventPublicationPublicController {
  constructor(
    private readonly publication: EventPublicationPublicService,
    private readonly media: EventPublicationMediaService,
  ) {}

  @Get()
  discover(
    @Query('q') query?: string,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('until') until?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const normalizedFormat = format && Object.values(EventFormat).includes(format as EventFormat)
      ? format as EventFormat
      : undefined;

    return this.publication.discover({
      query,
      format: normalizedFormat,
      from,
      until,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('meta/sitemap')
  getSitemapEntries() {
    return this.publication.listForSitemap();
  }

  @Get(':slug/media/:usage')
  async getMedia(
    @Param('slug') slug: string,
    @Param('usage') rawUsage: string,
    @Res() response: { setHeader(name: string, value: string | number): void; end(body: Buffer): void },
  ) {
    if (!EVENT_MEDIA_USAGES.includes(rawUsage as EventMediaUsageValue)) {
      throw new NotFoundException('Mídia não encontrada.');
    }
    const result = await this.media.readPublic(slug, rawUsage as EventMediaUsageValue);
    response.setHeader('Content-Type', result.row.mimeType);
    response.setHeader('Content-Length', result.bytes.length);
    response.setHeader('Cache-Control', result.cacheControl);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    response.end(result.bytes);
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    const result = await this.publication.findBySlug(slug);
    if (!result) throw new NotFoundException('Evento publicado não encontrado.');
    return result;
  }
}
