import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { EventPublicationPublicService } from './event-publication-public.service';

@Controller('public/events')
export class EventPublicationPublicController {
  constructor(private readonly publication: EventPublicationPublicService) {}

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    const result = await this.publication.findBySlug(slug);
    if (!result) throw new NotFoundException('Evento publicado não encontrado.');
    return result;
  }
}
