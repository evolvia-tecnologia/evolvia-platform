-- Additive foundation for Evolvia webhooks, read keys and site presence.
-- Existing events stay valid because no current column is rewritten.
CREATE TYPE "OutboundWebhookDeliveryStatus" AS ENUM ('DELIVERED', 'FAILED');

CREATE TABLE "EventOutboundWebhook" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3),
  CONSTRAINT "EventOutboundWebhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventOutboundWebhook_organizationId_eventId_enabled_idx"
  ON "EventOutboundWebhook"("organizationId", "eventId", "enabled");

ALTER TABLE "EventOutboundWebhook"
  ADD CONSTRAINT "EventOutboundWebhook_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EventOutboundWebhookDelivery" (
  "id" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "status" "OutboundWebhookDeliveryStatus" NOT NULL,
  "statusCode" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventOutboundWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventOutboundWebhookDelivery_webhookId_reservationId_key"
  ON "EventOutboundWebhookDelivery"("webhookId", "reservationId");
CREATE INDEX "EventOutboundWebhookDelivery_organizationId_eventId_createdAt_idx"
  ON "EventOutboundWebhookDelivery"("organizationId", "eventId", "createdAt");

ALTER TABLE "EventOutboundWebhookDelivery"
  ADD CONSTRAINT "EventOutboundWebhookDelivery_webhookId_fkey"
  FOREIGN KEY ("webhookId") REFERENCES "EventOutboundWebhook"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EventApiKey" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventApiKey_keyHash_key" ON "EventApiKey"("keyHash");
CREATE INDEX "EventApiKey_organizationId_eventId_revokedAt_idx"
  ON "EventApiKey"("organizationId", "eventId", "revokedAt");

ALTER TABLE "EventApiKey"
  ADD CONSTRAINT "EventApiKey_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
