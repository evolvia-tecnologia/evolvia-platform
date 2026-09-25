CREATE TYPE "RegistrationReservationStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "EventRegistrationLot"
  ADD CONSTRAINT "EventRegistrationLot_id_eventId_organizationId_key"
  UNIQUE ("id", "eventId", "organizationId");

ALTER TABLE "EventRegistrationBenefit"
  ADD CONSTRAINT "EventRegistrationBenefit_id_eventId_organizationId_key"
  UNIQUE ("id", "eventId", "organizationId");

CREATE TABLE "EventRegistrationReservation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "benefitId" TEXT,
  "protocol" VARCHAR(32) NOT NULL,
  "idempotencyKeyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "identityHash" CHAR(64) NOT NULL,
  "emailHash" CHAR(64) NOT NULL,
  "registrationData" JSONB NOT NULL,
  "basePriceCents" INTEGER NOT NULL,
  "discountPercent" INTEGER NOT NULL DEFAULT 0,
  "finalPriceCents" INTEGER NOT NULL,
  "status" "RegistrationReservationStatus" NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventRegistrationReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventRegistrationReservation_prices_check"
    CHECK ("basePriceCents" >= 0 AND "finalPriceCents" >= 0 AND "finalPriceCents" <= "basePriceCents"),
  CONSTRAINT "EventRegistrationReservation_discount_check"
    CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100),
  CONSTRAINT "EventRegistrationReservation_expiry_check"
    CHECK (
      ("status" = 'PENDING_PAYMENT' AND "expiresAt" IS NOT NULL AND "confirmedAt" IS NULL)
      OR ("status" = 'CONFIRMED' AND "expiresAt" IS NULL AND "confirmedAt" IS NOT NULL)
      OR ("status" IN ('EXPIRED', 'CANCELLED'))
    )
);

CREATE UNIQUE INDEX "EventRegistrationReservation_protocol_key"
  ON "EventRegistrationReservation"("protocol");
CREATE UNIQUE INDEX "EventRegistrationReservation_eventId_idempotencyKeyHash_key"
  ON "EventRegistrationReservation"("eventId", "idempotencyKeyHash");
CREATE UNIQUE INDEX "EventRegistrationReservation_eventId_identityHash_key"
  ON "EventRegistrationReservation"("eventId", "identityHash");
CREATE INDEX "EventRegistrationReservation_organizationId_eventId_status_expiresAt_idx"
  ON "EventRegistrationReservation"("organizationId", "eventId", "status", "expiresAt");
CREATE INDEX "EventRegistrationReservation_eventId_lotId_status_idx"
  ON "EventRegistrationReservation"("eventId", "lotId", "status");
CREATE INDEX "EventRegistrationReservation_eventId_benefitId_status_idx"
  ON "EventRegistrationReservation"("eventId", "benefitId", "status");

ALTER TABLE "EventRegistrationReservation"
  ADD CONSTRAINT "EventRegistrationReservation_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationReservation"
  ADD CONSTRAINT "EventRegistrationReservation_categoryId_eventId_organizationId_fkey"
  FOREIGN KEY ("categoryId", "eventId", "organizationId")
  REFERENCES "EventRegistrationCategory"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationReservation"
  ADD CONSTRAINT "EventRegistrationReservation_lotId_eventId_organizationId_fkey"
  FOREIGN KEY ("lotId", "eventId", "organizationId")
  REFERENCES "EventRegistrationLot"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationReservation"
  ADD CONSTRAINT "EventRegistrationReservation_benefitId_eventId_organizationId_fkey"
  FOREIGN KEY ("benefitId", "eventId", "organizationId")
  REFERENCES "EventRegistrationBenefit"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
