-- Persist a frozen, event-scoped communication audience without enabling email send.
CREATE TABLE "EventCommunicationBatch" (
  "id" UUID PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "draftId" UUID NOT NULL,
  "draftRevision" INTEGER NOT NULL CHECK ("draftRevision" > 0),
  "payloadHash" CHAR(64) NOT NULL,
  "subject" VARCHAR(180) NOT NULL,
  "body" VARCHAR(20000) NOT NULL,
  "audienceFilters" JSONB NOT NULL,
  "recipientCount" INTEGER NOT NULL CHECK ("recipientCount" BETWEEN 1 AND 5000),
  "status" VARCHAR(24) NOT NULL DEFAULT 'PREPARED' CHECK ("status" IN ('PREPARED','SENDING','ACCEPTED','RECEIVED','UNKNOWN','FAILED','CANCELLED')),
  "requestedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCommunicationBatch_event_fkey" FOREIGN KEY ("eventId","organizationId") REFERENCES "Event"("id","organizationId") ON DELETE RESTRICT,
  CONSTRAINT "EventCommunicationBatch_draft_fkey" FOREIGN KEY ("draftId","eventId","organizationId") REFERENCES "EventCommunicationDraft"("id","eventId","organizationId") ON DELETE RESTRICT,
  CONSTRAINT "EventCommunicationBatch_scope_key" UNIQUE ("id","eventId","organizationId")
);
CREATE INDEX "EventCommunicationBatch_scope_created_idx" ON "EventCommunicationBatch" ("organizationId","eventId","createdAt");

CREATE TABLE "EventCommunicationRecipient" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "batchId" UUID NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "emailFingerprint" CHAR(64) NOT NULL,
  "emailEnvelope" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','CLAIMED','ACCEPTED','RECEIVED','UNKNOWN','FAILED','CANCELLED')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCommunicationRecipient_batch_fkey" FOREIGN KEY ("batchId","eventId","organizationId") REFERENCES "EventCommunicationBatch"("id","eventId","organizationId") ON DELETE RESTRICT,
  CONSTRAINT "EventCommunicationRecipient_batch_email_key" UNIQUE ("batchId","emailFingerprint")
);
CREATE INDEX "EventCommunicationRecipient_scope_status_idx" ON "EventCommunicationRecipient" ("organizationId","eventId","batchId","status");
