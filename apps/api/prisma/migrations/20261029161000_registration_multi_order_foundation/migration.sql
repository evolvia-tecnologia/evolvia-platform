-- Expand-only foundation for atomic multi-entry registration orders.
-- No existing checkout or reservation table is modified in this migration.
CREATE TABLE "EventRegistrationOrder" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "idempotencyKeyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'RESERVED',
  "subtotalCents" INTEGER NOT NULL,
  "billingSnapshot" JSONB,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventRegistrationOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventRegistrationOrder_subtotal_nonnegative" CHECK ("subtotalCents" >= 0)
);

CREATE TABLE "EventRegistrationOrderEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "categoryId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "reservationId" TEXT,
  "identityHash" CHAR(64) NOT NULL,
  "emailHash" CHAR(64) NOT NULL,
  "basePriceCents" INTEGER NOT NULL,
  "finalPriceCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRegistrationOrderEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventRegistrationOrderEntry_position_nonnegative" CHECK ("position" >= 0),
  CONSTRAINT "EventRegistrationOrderEntry_prices_nonnegative" CHECK ("basePriceCents" >= 0 AND "finalPriceCents" >= 0)
);

CREATE TABLE "EventRegistrationOrderCheckout" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
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
  CONSTRAINT "EventRegistrationOrderCheckout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventRegistrationOrderCheckout_amount_nonnegative" CHECK ("amountCents" >= 0)
);

CREATE UNIQUE INDEX "EventRegistrationOrder_eventId_idempotencyKeyHash_key" ON "EventRegistrationOrder"("eventId", "idempotencyKeyHash");
CREATE UNIQUE INDEX "EventRegistrationOrder_id_eventId_organizationId_key" ON "EventRegistrationOrder"("id", "eventId", "organizationId");
CREATE INDEX "EventRegistrationOrder_organizationId_eventId_status_expiresAt_idx" ON "EventRegistrationOrder"("organizationId", "eventId", "status", "expiresAt");
CREATE UNIQUE INDEX "EventRegistrationOrderEntry_reservationId_key" ON "EventRegistrationOrderEntry"("reservationId");
CREATE UNIQUE INDEX "EventRegistrationOrderEntry_orderId_position_key" ON "EventRegistrationOrderEntry"("orderId", "position");
CREATE UNIQUE INDEX "EventRegistrationOrderEntry_orderId_identityHash_key" ON "EventRegistrationOrderEntry"("orderId", "identityHash");
CREATE UNIQUE INDEX "EventRegistrationOrderEntry_reservationId_eventId_organizationId_key" ON "EventRegistrationOrderEntry"("reservationId", "eventId", "organizationId");
CREATE INDEX "EventRegistrationOrderEntry_organizationId_eventId_orderId_idx" ON "EventRegistrationOrderEntry"("organizationId", "eventId", "orderId");
CREATE UNIQUE INDEX "EventRegistrationOrderCheckout_orderId_key" ON "EventRegistrationOrderCheckout"("orderId");
CREATE UNIQUE INDEX "EventRegistrationOrderCheckout_provider_providerCheckoutId_key" ON "EventRegistrationOrderCheckout"("provider", "providerCheckoutId");
CREATE UNIQUE INDEX "EventRegistrationOrderCheckout_eventId_idempotencyKeyHash_key" ON "EventRegistrationOrderCheckout"("eventId", "idempotencyKeyHash");
CREATE UNIQUE INDEX "EventRegistrationOrderCheckout_orderId_eventId_organizationId_key" ON "EventRegistrationOrderCheckout"("orderId", "eventId", "organizationId");
CREATE INDEX "EventRegistrationOrderCheckout_organizationId_eventId_status_expiresAt_idx" ON "EventRegistrationOrderCheckout"("organizationId", "eventId", "status", "expiresAt");

ALTER TABLE "EventRegistrationOrder" ADD CONSTRAINT "EventRegistrationOrder_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationOrderEntry" ADD CONSTRAINT "EventRegistrationOrderEntry_orderId_eventId_organizationId_fkey"
  FOREIGN KEY ("orderId", "eventId", "organizationId") REFERENCES "EventRegistrationOrder"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationOrderEntry" ADD CONSTRAINT "EventRegistrationOrderEntry_categoryId_eventId_organizationId_fkey"
  FOREIGN KEY ("categoryId", "eventId", "organizationId") REFERENCES "EventRegistrationCategory"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationOrderEntry" ADD CONSTRAINT "EventRegistrationOrderEntry_lotId_eventId_organizationId_fkey"
  FOREIGN KEY ("lotId", "eventId", "organizationId") REFERENCES "EventRegistrationLot"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationOrderEntry" ADD CONSTRAINT "EventRegistrationOrderEntry_reservationId_eventId_organizationId_fkey"
  FOREIGN KEY ("reservationId", "eventId", "organizationId") REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationOrderCheckout" ADD CONSTRAINT "EventRegistrationOrderCheckout_orderId_eventId_organizationId_fkey"
  FOREIGN KEY ("orderId", "eventId", "organizationId") REFERENCES "EventRegistrationOrder"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
