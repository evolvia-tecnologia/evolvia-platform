import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationCategoryProofService } from './registration-category-proof.service';
import { RegistrationOperationsService } from './registration-operations.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-operations')
export class RegistrationOperationsController {
  constructor(
    private readonly operations: RegistrationOperationsService,
    private readonly categoryProofs: RegistrationCategoryProofService,
  ) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query() query: { page?: string; status?: string; protocol?: string },
  ) {
    return this.operations.list(request.user!.id, eventId, query);
  }

  @Post(':protocol/category-proof')
  reviewCategoryProof(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('protocol') protocol: string,
    @Body() input: unknown,
  ) {
    return this.categoryProofs.review(request.user!.id, eventId, protocol, input);
  }

  @Get(':protocol/category-proof/file')
  async categoryProofFile(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('protocol') protocol: string,
    @Res() response: { setHeader(name: string, value: string | number): void; end(body: Buffer): void },
  ) {
    const result = await this.categoryProofs.readForOrganizer(request.user!.id, eventId, protocol);
    for (const [name, value] of Object.entries(this.categoryProofs.headers())) response.setHeader(name, value);
    response.setHeader('Content-Length', result.bytes.length);
    response.end(result.bytes);
  }
}
