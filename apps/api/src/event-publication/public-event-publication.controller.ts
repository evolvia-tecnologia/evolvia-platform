import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PublicEventPublicationService } from './public-event-publication.service';

@Controller('public/events')
export class PublicEventPublicationController {
  constructor(private readonly publication: PublicEventPublicationService) {}

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    const result = await this.publication.getBySlug(slug);
    if (!result) throw new NotFoundException('Evento não encontrado.');
    return result;
  }
}
