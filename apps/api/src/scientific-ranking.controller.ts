import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ScientificRankingService } from './scientific-ranking.service';

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/ranking')
export class ScientificRankingController {
  constructor(private readonly ranking: ScientificRankingService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.ranking.get(request.user!.id, eventId);
  }

  @Put()
  save(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: unknown,
  ) {
    return this.ranking.save(request.user!.id, eventId, input);
  }
}
