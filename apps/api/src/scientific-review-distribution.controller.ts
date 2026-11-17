import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ScientificReviewDistributionService } from './scientific-review-distribution.service';

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/reviews/distribution')
export class ScientificReviewDistributionController {
  constructor(private readonly distribution: ScientificReviewDistributionService) {}

  @Get()
  preview(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.distribution.preview(request.user!.id, eventId);
  }

  @Post()
  apply(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.distribution.apply(request.user!.id, eventId);
  }
}
