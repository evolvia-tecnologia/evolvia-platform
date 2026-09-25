-- Additive, idempotent history for holder-controlled registration corrections.
ALTER TABLE "EventRegistrationReservation"
  ADD COLUMN IF NOT EXISTS "registrationRevision" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "ParticipantRegistrationRevision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "fromRevision" INTEGER NOT NULL,
  "toRevision" INTEGER NOT NULL,
  "previousEditableData" JSONB NOT NULL,
  "nextEditableData" JSONB NOT NULL,
  "changedFieldCodes" JSONB NOT NULL,
  "idempotencyKeyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParticipantRegistrationRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParticipantRegistrationRevision_reservationId_idempotencyKeyHash_key"
  ON "ParticipantRegistrationRevision"("reservationId", "idempotencyKeyHash");
CREATE UNIQUE INDEX IF NOT EXISTS "ParticipantRegistrationRevision_reservationId_toRevision_key"
  ON "ParticipantRegistrationRevision"("reservationId", "toRevision");
CREATE INDEX IF NOT EXISTS "ParticipantRegistrationRevision_scope_createdAt_idx"
  ON "ParticipantRegistrationRevision"("organizationId", "eventId", "reservationId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ParticipantRegistrationRevision_reservation_scope_fkey'
  ) THEN
    ALTER TABLE "ParticipantRegistrationRevision"
      ADD CONSTRAINT "ParticipantRegistrationRevision_reservation_scope_fkey"
      FOREIGN KEY ("reservationId", "eventId", "organizationId")
      REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Rollback: drop ParticipantRegistrationRevision, then registrationRevision.
-- The rollback discards only correction history created by this feature.
