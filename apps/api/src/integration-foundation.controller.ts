import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { IntegrationFoundationService } from './integration-foundation.service';

class CreateWebhookDto {
  @IsString()
  @MaxLength(300)
  url!: string;
}

class CreateApiKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

class OpenPreparationDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(80)
  accountLabel!: string;
}

@UseGuards(AuthGuard)
@Controller('events/:eventId/integrations')
export class IntegrationFoundationController {
  constructor(private readonly foundation: IntegrationFoundationService) {}

  @Get('webhooks')
  listWebhooks(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.foundation.listWebhooks(request.user!.id, eventId);
  }

  @Post('webhooks')
  createWebhook(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() dto: CreateWebhookDto) {
    return this.foundation.createWebhook(request.user!.id, eventId, dto);
  }

  @Post('webhooks/:webhookId/disable')
  disableWebhook(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.foundation.disableWebhook(request.user!.id, eventId, webhookId);
  }

  @Get('api-keys')
  listApiKeys(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.foundation.listApiKeys(request.user!.id, eventId);
  }

  @Post('api-keys')
  createApiKey(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() dto: CreateApiKeyDto) {
    return this.foundation.createApiKey(request.user!.id, eventId, dto);
  }

  @Post('api-keys/:keyId/revoke')
  revokeApiKey(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.foundation.revokeApiKey(request.user!.id, eventId, keyId);
  }

  @Get('presence')
  presence(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.foundation.presence(request.user!.id, eventId);
  }

  @Get('preparations')
  listPreparations(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.foundation.listPreparations(request.user!.id, eventId);
  }

  @Post('preparations')
  openPreparation(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: OpenPreparationDto,
  ) {
    return this.foundation.openPreparation(request.user!.id, eventId, dto);
  }

  @Post('preparations/:code/withdraw')
  withdrawPreparation(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('code') code: string,
  ) {
    return this.foundation.withdrawPreparation(request.user!.id, eventId, code);
  }
}

@Controller('v1/events')
export class IntegrationFoundationPublicController {
  constructor(private readonly foundation: IntegrationFoundationService) {}

  @Get(':slug')
  read(@Param('slug') slug: string, @Headers('authorization') authorization: string | undefined) {
    return this.foundation.readPublicEvent(slug, authorization);
  }
}
