CREATE TYPE "RegistrationCheckoutStatus" AS ENUM (
  'CREATING',
  'ACTIVE',
  'PAID',
  'PAID_REVIEW',
  'CANCELED',
  'EXPIRED',
  'FAILED',
  'UNKNOWN'
);

ALTER TABLE "EventRegistrationReservation"
  ADD CONSTRAINT "EventRegistrationReservation_id_eventId_organizationId_key"
  UNIQUE ("id", "eventId", "organizationId");

CREATE TABLE "EventRegistrationCheckout" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "provider" VARCHAR(20) NOT NULL DEFAULT 'ASAAS',
  "providerCheckoutId" VARCHAR(200),
  "idempotencyKeyHash" CHAR(64) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "status" "RegistrationCheckoutStatus" NOT NULL DEFAULT 'CREATING',
  "checkoutUrl" VARCHAR(512),
  "amountCents" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "failureCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventRegistrationCheckout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventRegistrationCheckout_amount_check" CHECK ("amountCents" > 0),
  CONSTRAINT "EventRegistrationCheckout_provider_check" CHECK ("provider" = 'ASAAS')
);

CREATE TABLE "AsaasCheckoutWebhookEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "eventId" TEXT,
  "checkoutId" TEXT,
  "providerEventId" VARCHAR(200) NOT NULL,
  "externalCheckoutId" VARCHAR(200) NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "checkoutStatus" VARCHAR(32),
  "amountCents" INTEGER,
  "payloadHash" CHAR(64) NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AsaasCheckoutWebhookEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AsaasCheckoutWebhookEvent_amount_check" CHECK ("amountCents" IS NULL OR "amountCents" >= 0),
  CONSTRAINT "AsaasCheckoutWebhookEvent_scope_check" CHECK (
    ("checkoutId" IS NULL AND "eventId" IS NULL AND "organizationId" IS NULL)
    OR
    ("checkoutId" IS NOT NULL AND "eventId" IS NOT NULL AND "organizationId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "EventRegistrationCheckout_reservationId_key"
ON "EventRegistrationCheckout"("reservationId");
CREATE UNIQUE INDEX "EventRegistrationCheckout_provider_providerCheckoutId_key"
ON "EventRegistrationCheckout"("provider", "providerCheckoutId");
CREATE UNIQUE INDEX "EventRegistrationCheckout_eventId_idempotencyKeyHash_key"
ON "EventRegistrationCheckout"("eventId", "idempotencyKeyHash");
CREATE UNIQUE INDEX "EventRegistrationCheckout_reservationId_eventId_organizationId_key"
ON "EventRegistrationCheckout"("reservationId", "eventId", "organizationId");
CREATE UNIQUE INDEX "EventRegistrationCheckout_id_eventId_organizationId_key"
ON "EventRegistrationCheckout"("id", "eventId", "organizationId");
CREATE INDEX "EventRegistrationCheckout_organizationId_eventId_status_expiresAt_idx"
ON "EventRegistrationCheckout"("organizationId", "eventId", "status", "expiresAt");

CREATE UNIQUE INDEX "AsaasCheckoutWebhookEvent_providerEventId_key"
ON "AsaasCheckoutWebhookEvent"("providerEventId");
CREATE INDEX "AsaasCheckoutWebhookEvent_externalCheckoutId_processedAt_idx"
ON "AsaasCheckoutWebhookEvent"("externalCheckoutId", "processedAt");
CREATE INDEX "AsaasCheckoutWebhookEvent_organizationId_eventId_createdAt_idx"
ON "AsaasCheckoutWebhookEvent"("organizationId", "eventId", "createdAt");

ALTER TABLE "EventRegistrationCheckout"
ADD CONSTRAINT "EventRegistrationCheckout_eventId_organizationId_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationCheckout"
ADD CONSTRAINT "EventRegistrationCheckout_reservationId_eventId_organizationId_fkey"
FOREIGN KEY ("reservationId", "eventId", "organizationId")
REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AsaasCheckoutWebhookEvent"
ADD CONSTRAINT "AsaasCheckoutWebhookEvent_checkoutId_eventId_organizationId_fkey"
FOREIGN KEY ("checkoutId", "eventId", "organizationId")
REFERENCES "EventRegistrationCheckout"("id", "eventId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
