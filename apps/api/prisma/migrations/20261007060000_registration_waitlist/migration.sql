-- Fila de espera por lote. Somente aditiva; rollback:
--   DROP TABLE "EventRegistrationWaitlistEntry";
--   DROP TYPE "RegistrationWaitlistStatus";
--   ALTER TABLE "EventRegistrationLot" DROP COLUMN "waitlistEnabled", DROP COLUMN "waitlistOfferMinutes", DROP COLUMN "waitlistClosesAt";

CREATE TYPE "RegistrationWaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'ACCEPTED', 'LEFT', 'OFFER_EXPIRED');

ALTER TABLE "EventRegistrationLot" ADD COLUMN "waitlistClosesAt" TIMESTAMP(3),
ADD COLUMN "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "waitlistOfferMinutes" INTEGER;

ALTER TABLE "EventRegistrationLot" ADD CONSTRAINT "EventRegistrationLot_waitlistOfferMinutes_check"
  CHECK ("waitlistOfferMinutes" IS NULL OR ("waitlistOfferMinutes" >= 15 AND "waitlistOfferMinutes" <= 10080));
ALTER TABLE "EventRegistrationLot" ADD CONSTRAINT "EventRegistrationLot_waitlistEnabled_check"
  CHECK ("waitlistEnabled" = false OR "waitlistOfferMinutes" IS NOT NULL);

CREATE TABLE "EventRegistrationWaitlistEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identityHash" CHAR(64) NOT NULL,
    "emailHash" CHAR(64) NOT NULL,
    "status" "RegistrationWaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offeredAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "promotionKeyHash" CHAR(64),
    "reservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistrationWaitlistEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventRegistrationWaitlistEntry_offer_check"
      CHECK ("status" <> 'OFFERED' OR ("offeredAt" IS NOT NULL AND "offerExpiresAt" IS NOT NULL)),
    CONSTRAINT "EventRegistrationWaitlistEntry_accepted_check"
      CHECK ("status" <> 'ACCEPTED' OR "reservationId" IS NOT NULL)
);

CREATE UNIQUE INDEX "EventRegistrationWaitlistEntry_reservationId_key" ON "EventRegistrationWaitlistEntry"("reservationId");
CREATE INDEX "EventRegistrationWaitlistEntry_lotId_status_queuedAt_idx" ON "EventRegistrationWaitlistEntry"("lotId", "status", "queuedAt");
CREATE INDEX "EventRegistrationWaitlistEntry_eventId_identityHash_idx" ON "EventRegistrationWaitlistEntry"("eventId", "identityHash");
CREATE INDEX "EventRegistrationWaitlistEntry_organizationId_eventId_statu_idx" ON "EventRegistrationWaitlistEntry"("organizationId", "eventId", "status");
CREATE UNIQUE INDEX "EventRegistrationWaitlistEntry_lotId_userId_key" ON "EventRegistrationWaitlistEntry"("lotId", "userId");
CREATE UNIQUE INDEX "EventRegistrationWaitlistEntry_lotId_promotionKeyHash_key" ON "EventRegistrationWaitlistEntry"("lotId", "promotionKeyHash");
CREATE UNIQUE INDEX "EventRegistrationWaitlistEntry_reservationId_eventId_organi_key" ON "EventRegistrationWaitlistEntry"("reservationId", "eventId", "organizationId");

ALTER TABLE "EventRegistrationWaitlistEntry" ADD CONSTRAINT "EventRegistrationWaitlistEntry_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationWaitlistEntry" ADD CONSTRAINT "EventRegistrationWaitlistEntry_categoryId_eventId_organiza_fkey" FOREIGN KEY ("categoryId", "eventId", "organizationId") REFERENCES "EventRegistrationCategory"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationWaitlistEntry" ADD CONSTRAINT "EventRegistrationWaitlistEntry_lotId_eventId_organizationI_fkey" FOREIGN KEY ("lotId", "eventId", "organizationId") REFERENCES "EventRegistrationLot"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationWaitlistEntry" ADD CONSTRAINT "EventRegistrationWaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationWaitlistEntry" ADD CONSTRAINT "EventRegistrationWaitlistEntry_reservationId_eventId_organ_fkey" FOREIGN KEY ("reservationId", "eventId", "organizationId") REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
