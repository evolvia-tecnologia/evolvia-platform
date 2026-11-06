-- Preparação local dos conectores externos. Não guarda segredo nem destino de envio.
CREATE TABLE "EventIntegrationPreparation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "accountLabel" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" TIMESTAMP(3),
  CONSTRAINT "EventIntegrationPreparation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventIntegrationPreparation_eventId_code_key"
  ON "EventIntegrationPreparation"("eventId", "code");

CREATE INDEX "EventIntegrationPreparation_organizationId_eventId_withdrawnAt_idx"
  ON "EventIntegrationPreparation"("organizationId", "eventId", "withdrawnAt");

ALTER TABLE "EventIntegrationPreparation"
  ADD CONSTRAINT "EventIntegrationPreparation_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
