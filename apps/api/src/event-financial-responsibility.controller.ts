import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { prepareFiscalAdapterPreview } from './nfse-adapter-preview';
import type { FiscalSetup } from './nfse-draft-policy';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { SaveEventFinancialResponsibilityDto } from './event-financial-responsibility.dto';
import { EventFinancialResponsibilityService } from './event-financial-responsibility.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/financial-responsibility')
export class EventFinancialResponsibilityController {
  constructor(private readonly responsibility: EventFinancialResponsibilityService) {}

  @Get('receipts/:receiptId/nfse-draft')
  fiscalDraft(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('receiptId') receiptId: string) {
    return this.responsibility.fiscalDraft(request.user!.id, eventId, receiptId);
  }

  @Get('receipts/:receiptId/nfse-draft/adapters/:provider')
  async fiscalAdapterPreview(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string,
    @Param('receiptId') receiptId: string, @Param('provider') provider: string) {
    const draft = await this.responsibility.fiscalDraft(request.user!.id, eventId, receiptId);
    return prepareFiscalAdapterPreview(provider, draft);
  }

  @Put('receipts/:receiptId/nfse-sandbox/preparation')
  prepareSandbox(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('receiptId') receiptId: string) {
    return this.responsibility.prepareSandbox(request.user!.id, eventId, receiptId);
  }

  @Put('receipts/:receiptId/nfse-draft')
  prepareFiscalDraft(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string,
    @Param('receiptId') receiptId: string, @Body() setup: FiscalSetup) {
    return this.responsibility.fiscalDraft(request.user!.id, eventId, receiptId, { setup });
  }

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.responsibility.get(request.user!.id, eventId);
  }

  @Put()
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() dto: SaveEventFinancialResponsibilityDto) {
    return this.responsibility.save(request.user!.id, eventId, dto);
  }
}
