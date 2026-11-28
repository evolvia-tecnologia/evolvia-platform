ALTER TABLE "EventCommunicationBatch" ADD COLUMN "startedByUserId" TEXT;
ALTER TABLE "EventCommunicationBatch" DROP CONSTRAINT "EventCommunicationBatch_status_check",
  ADD CONSTRAINT "EventCommunicationBatch_status_check" CHECK ("status" IN
    ('PREPARED','SENDING','ACCEPTED','RECEIVED','UNKNOWN','FAILED','CANCELLED','PARTIAL'));
ALTER TABLE "EventCommunicationRecipient"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "claimToken" UUID,
  ADD COLUMN "claimUntil" TIMESTAMPTZ,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ,
  ADD COLUMN "receiptHash" CHAR(64);
CREATE INDEX "EventCommunicationRecipient_dispatch_idx" ON "EventCommunicationRecipient"
  ("organizationId","eventId","status","nextAttemptAt");

