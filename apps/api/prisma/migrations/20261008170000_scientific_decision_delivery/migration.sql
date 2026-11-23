-- Entrega da carta na área do autor. Não guarda o texto nem o e-mail.

CREATE TYPE "ScientificDecisionDeliveryKind" AS ENUM ('ACCEPTANCE', 'REJECTION');

CREATE TYPE "ScientificDecisionDeliveryAction" AS ENUM ('VIEWED', 'DOWNLOADED');

CREATE TABLE "ScientificDecisionDelivery" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "kind" "ScientificDecisionDeliveryKind" NOT NULL,
  "action" "ScientificDecisionDeliveryAction" NOT NULL,
  "channel" VARCHAR(40) NOT NULL DEFAULT 'AUTHOR_AREA',
  "documentHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScientificDecisionDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScientificDecisionDelivery_channel_check" CHECK ("channel" = 'AUTHOR_AREA')
);

CREATE INDEX "ScientificDecisionDelivery_organizationId_eventId_createdAt_idx" ON "ScientificDecisionDelivery"("organizationId", "eventId", "createdAt");
CREATE INDEX "ScientificDecisionDelivery_submissionId_createdAt_idx" ON "ScientificDecisionDelivery"("submissionId", "createdAt");

ALTER TABLE "ScientificDecisionDelivery"
  ADD CONSTRAINT "ScientificDecisionDelivery_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificDecisionDelivery"
  ADD CONSTRAINT "ScientificDecisionDelivery_submissionId_eventId_organizationId_fkey"
  FOREIGN KEY ("submissionId", "eventId", "organizationId") REFERENCES "ScientificSubmission"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
