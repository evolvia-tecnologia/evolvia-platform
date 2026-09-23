import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { ParticipantAccessInput } from './participant-area-policy';
import { ParticipantAreaService } from './participant-area.service';

@Controller('public/events/:slug/participant')
export class ParticipantAreaController {
  constructor(private readonly participantArea: ParticipantAreaService) {}

  @Post('sessions')
  createSession(@Param('slug') slug: string, @Body() input: ParticipantAccessInput) {
    return this.participantArea.createSession(slug, input);
  }

  @Get('me')
  getArea(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.participantArea.getArea(slug, authorization);
  }

  @Delete('sessions/current')
  revoke(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.participantArea.revoke(slug, authorization);
  }
}
