import { Body, Controller, Delete, Get, Header, Headers, Param, Post, StreamableFile } from '@nestjs/common';
import { ScientificAuthorService } from './scientific-author.service';

@Controller('public/events/:slug/participant/submissions')
export class ScientificAuthorController {
  constructor(private readonly authors: ScientificAuthorService) {}

  @Get()
  get(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.authors.get(slug, authorization);
  }

  @Post('drafts')
  saveDraft(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.authors.saveDraft(slug, authorization, body, key);
  }

  @Delete('drafts/:submissionId')
  deleteDraft(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.authors.deleteDraft(slug, authorization, submissionId);
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

  @Post(':submissionId/versions')
  revise(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.authors.revise(slug, authorization, submissionId, body);
  }

  @Get(':submissionId/versions/:versionNumber/file')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "sandbox; default-src 'none'")
  @Header('Cache-Control', 'private, no-store')
  async versionFile(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Param('versionNumber') versionNumber: string,
    @Headers('authorization') authorization?: string,
  ) {
    const file = await this.authors.submissionVersionFile(slug, authorization, submissionId, versionNumber);
    return new StreamableFile(file.bytes, { type: 'application/pdf', disposition: `attachment; filename="${file.fileName}"` });
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

  @Get(':submissionId/acceptance-letter')
  acceptanceLetter(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authors.acceptanceLetter(slug, authorization, submissionId);
  }

  @Get(':submissionId/decision-letter')
  decisionLetter(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authors.acceptanceLetter(slug, authorization, submissionId);
  }

  @Post(':submissionId/eposter/second')
  uploadSecondEposter(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.authors.uploadFollowUp(slug, authorization, submissionId, 'second', body);
  }

  @Post(':submissionId/slide')
  uploadSlide(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.authors.uploadFollowUp(slug, authorization, submissionId, 'slide', body);
  }
}
