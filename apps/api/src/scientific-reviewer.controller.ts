import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ScientificReviewerService } from './scientific-reviewer.service';

@Controller('public/events/:slug/reviewer')
export class ScientificReviewerController {
  constructor(private readonly reviewers: ScientificReviewerService) {}

  @Get()
  area(@Req() request: AccessShieldRequest, @Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    assertAccessRate(request, 'reviewer-area', 20);
    return this.reviewers.area(slug, authorization);
  }

  @Post('assignments/:assignmentId')
  submit(
    @Req() request: AccessShieldRequest,
    @Param('slug') slug: string,
    @Param('assignmentId') assignmentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    assertAccessRate(request, 'reviewer-opinion', 8);
    return this.reviewers.submit(slug, authorization, assignmentId, body);
  }
}

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/reviews')
export class ScientificReviewerOrganizerController {
  constructor(private readonly reviewers: ScientificReviewerService) {}

  @Post('reviewers/:personId/access')
  issue(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('personId') personId: string) {
    return this.reviewers.issueAccess(request.user!.id, eventId, personId);
  }

  @Post('submissions/:submissionId/decision')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('submissionId') submissionId: string,
    @Body() body: unknown,
  ) {
    return this.reviewers.decide(request.user!.id, eventId, submissionId, body);
  }
}
