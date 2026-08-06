import { ConflictException, Injectable } from '@nestjs/common';
import { EventStatus } from '@prisma/client';

const FOUNDATION_MUTABLE_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.SETUP,
]);

@Injectable()
export class EventMutationPolicy {
  assertFoundationMutable(status: EventStatus): void {
    if (FOUNDATION_MUTABLE_STATUSES.has(status)) return;

    throw new ConflictException({
      code: 'INVALID_EVENT_STATE',
      message: 'A fundação não pode ser alterada no estado atual do evento.',
      context: { eventStatus: status },
    });
  }

  statusAfterFoundationCompletion(currentStatus: EventStatus): EventStatus {
    this.assertFoundationMutable(currentStatus);
    return currentStatus === EventStatus.DRAFT ? EventStatus.SETUP : currentStatus;
  }
}
