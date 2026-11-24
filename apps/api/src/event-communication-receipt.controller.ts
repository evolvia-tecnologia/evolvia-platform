import { Body, Controller, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EventCommunicationDispatchService } from './event-communication-dispatch.service';

@Controller('events/:eventId/communication/batches')
export class EventCommunicationReceiptController {
  constructor(private readonly dispatcher: EventCommunicationDispatchService) {}

  // Service-to-service receipt, authenticated by a separate mailbox-verifier signature.
  @Post(':batchId/recipients/:recipientId/mailbox-receipt')
  receive(@Param('eventId') eventId: string, @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('recipientId', ParseUUIDPipe) recipientId: string, @Body('evidenceHash') evidenceHash: unknown,
    @Headers('x-evolvia-mailbox-signature') signature?: string) {
    return this.dispatcher.reconcile(eventId, batchId, recipientId, evidenceHash, signature);
  }
}
