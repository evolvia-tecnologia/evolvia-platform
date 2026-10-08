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

  @Post(':submissionId/versions')
  revise(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.authors.revise(slug, authorization, submissionId, body);
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

  @Post(':submissionId/decision-letter/receipt')
  decisionLetterReceipt(
    @Param('slug') slug: string,
    @Param('submissionId') submissionId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authors.recordDecisionDownload(slug, authorization, submissionId);
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
