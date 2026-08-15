import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { EventFormat } from '@prisma/client';
import { EventPublicationPublicService } from './event-publication-public.service';

@Controller('public/events')
export class EventPublicationPublicController {
  constructor(private readonly publication: EventPublicationPublicService) {}

  @Get()
  discover(
    @Query('q') query?: string,
    @Query('format') format?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const normalizedFormat = format && Object.values(EventFormat).includes(format as EventFormat)
      ? format as EventFormat
      : undefined;

    return this.publication.discover({
      query,
      format: normalizedFormat,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    const result = await this.publication.findBySlug(slug);
    if (!result) throw new NotFoundException('Evento publicado não encontrado.');
    return result;
  }
}
