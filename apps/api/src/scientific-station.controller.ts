import { Body, Controller, Get, Header, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ScientificStationService } from './scientific-station.service';

@Controller('public/events/:slug/station')
export class ScientificStationPublicController {
  constructor(private readonly station: ScientificStationService) {}

  @Get()
  search(
    @Req() request: AccessShieldRequest,
    @Param('slug') slug: string,
    @Query('field') field?: string,
    @Query('q') text?: string,
  ) {
    assertAccessRate(request, 'scientific-station', 30);
    return this.station.search(slug, field, text);
  }

  @Get(':code/eposter')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "sandbox; default-src 'none'")
  @Header('Cache-Control', 'private, no-store')
  async eposter(
    @Req() request: AccessShieldRequest,
    @Param('slug') slug: string,
    @Param('code') code: string,
    @Query('download') download?: string,
  ) {
    assertAccessRate(request, 'scientific-station-file', 30);
    const file = await this.station.eposter(slug, code);
    const disposition = download === '1' ? 'attachment' : 'inline';
    return new StreamableFile(file.bytes, { type: 'application/pdf', disposition: `${disposition}; filename="${file.fileName}"` });
  }

  @Get(':code')
  detail(@Req() request: AccessShieldRequest, @Param('slug') slug: string, @Param('code') code: string) {
    assertAccessRate(request, 'scientific-station', 30);
    return this.station.detail(slug, code);
  }
}

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/station')
export class ScientificStationOrganizerController {
  constructor(private readonly station: ScientificStationService) {}

  @Get()
  management(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.station.management(request.user!.id, eventId);
  }

  @Patch('works/:submissionId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('submissionId') submissionId: string,
    @Body() body: unknown,
  ) {
    return this.station.updateVisibility(request.user!.id, eventId, submissionId, body);
  }
}
