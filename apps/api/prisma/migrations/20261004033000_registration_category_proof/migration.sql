-- Additive proof file for categories that must be approved before payment.
-- Existing reservations stay valid because the proof row is optional.
CREATE TYPE "RegistrationProofState" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "EventRegistrationCategoryProof" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "checksumSha256" CHAR(64) NOT NULL,
  "state" "RegistrationProofState" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventRegistrationCategoryProof_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventRegistrationCategoryProof_reservationId_key" ON "EventRegistrationCategoryProof"("reservationId");
CREATE UNIQUE INDEX "EventRegistrationCategoryProof_reservationId_eventId_organizationId_key" ON "EventRegistrationCategoryProof"("reservationId", "eventId", "organizationId");
CREATE UNIQUE INDEX "EventRegistrationCategoryProof_storageKey_key" ON "EventRegistrationCategoryProof"("storageKey");
CREATE UNIQUE INDEX "EventRegistrationCategoryProof_id_eventId_organizationId_key" ON "EventRegistrationCategoryProof"("id", "eventId", "organizationId");
CREATE INDEX "EventRegistrationCategoryProof_organizationId_eventId_state_idx" ON "EventRegistrationCategoryProof"("organizationId", "eventId", "state");

ALTER TABLE "EventRegistrationCategoryProof"
  ADD CONSTRAINT "EventRegistrationCategoryProof_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationCategoryProof"
  ADD CONSTRAINT "EventRegistrationCategoryProof_reservationId_eventId_organizationId_fkey"
  FOREIGN KEY ("reservationId", "eventId", "organizationId")
  REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
