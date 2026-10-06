import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ScientificProgramPublicService } from './scientific-program-public.service';

@Controller('public/events/:slug/program')
export class ScientificProgramPublicController {
  constructor(private readonly program: ScientificProgramPublicService) {}

  @Get()
  async get(@Param('slug') slug: string) {
    const result = await this.program.findBySlug(slug);
    if (!result) throw new NotFoundException('Programação pública não encontrada.');
    return result;
  }
}
