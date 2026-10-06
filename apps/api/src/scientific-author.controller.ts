import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ScientificAuthorService } from './scientific-author.service';

@Controller('public/events/:slug/participant/submissions')
export class ScientificAuthorController {
  constructor(private readonly authors: ScientificAuthorService) {}

  @Get()
  get(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.authors.get(slug, authorization);
  }

  @Post()
  submit(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.authors.submit(slug, authorization, body, key);
  }

  @Get(':submissionId/acceptance-letter')
  acceptanceLetter(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authors.acceptanceLetter(slug, authorization, submissionId);
  }

  @Post(':submissionId/eposter')
  uploadEposter(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.authors.uploadEposter(slug, authorization, submissionId, body);
  }
}
