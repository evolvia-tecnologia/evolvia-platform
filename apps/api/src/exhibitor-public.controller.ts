import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { ExhibitorService } from './exhibitor.service';

@Controller('public/events/:slug/exhibitor')
export class ExhibitorPublicController {
  constructor(private readonly exhibitors: ExhibitorService) {}

  @Post('sessions')
  createSession(@Req() request: AccessShieldRequest, @Param('slug') slug: string, @Body() input: unknown) {
    assertAccessRate(request, 'exhibitor-session', 8);
    return this.exhibitors.createSession(slug, input);
  }

  @Get('me')
  area(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.exhibitors.area(slug, authorization);
  }

  @Post('credentials')
  saveCredential(@Param('slug') slug: string, @Headers('authorization') authorization: string | undefined, @Body() input: unknown) {
    return this.exhibitors.saveOwnCredential(slug, authorization, input);
  }

  @Post('orders')
  requestOrder(@Param('slug') slug: string, @Headers('authorization') authorization: string | undefined, @Body() input: unknown) {
    return this.exhibitors.requestOrder(slug, authorization, input);
  }

  @Post('representatives')
  addRepresentative(@Param('slug') slug: string, @Headers('authorization') authorization: string | undefined, @Body() input: unknown) {
    return this.exhibitors.addRepresentative(slug, authorization, input);
  }

  @Post('messages')
  sendMessage(@Param('slug') slug: string, @Headers('authorization') authorization: string | undefined, @Body() input: unknown) {
    return this.exhibitors.sendMessage(slug, authorization, input);
  }

  @Patch('profile')
  updateProfile(@Param('slug') slug: string, @Headers('authorization') authorization: string | undefined, @Body() input: unknown) {
    return this.exhibitors.updateOwnProfile(slug, authorization, input);
  }

  @Delete('sessions/current')
  revoke(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.exhibitors.revoke(slug, authorization);
  }
}
