-- Additive. Drafts never authorize sending. Rollback keeps saved content.
CREATE TABLE "EventCommunicationDraft" (
  "id" UUID NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "subject" VARCHAR(180) NOT NULL,
  "body" VARCHAR(20000) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventCommunicationDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventCommunicationDraft_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "EventCommunicationDraft_subject_check" CHECK (length(btrim("subject")) >= 1),
  CONSTRAINT "EventCommunicationDraft_event_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EventCommunicationDraft_id_eventId_organizationId_key" ON "EventCommunicationDraft"("id", "eventId", "organizationId");
CREATE INDEX "EventCommunicationDraft_organizationId_eventId_updatedAt_idx" ON "EventCommunicationDraft"("organizationId", "eventId", "updatedAt");
