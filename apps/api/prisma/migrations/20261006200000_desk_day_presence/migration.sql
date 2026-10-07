-- Presença por dia e estorno lógico. A linha original permanece.

ALTER TABLE "EventRegistrationCheckIn"
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedByUserId" TEXT,
  ADD COLUMN "reversalReason" VARCHAR(160);

ALTER TABLE "EventMaterialDelivery"
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedByUserId" TEXT,
  ADD COLUMN "reversalReason" VARCHAR(160);

CREATE TABLE "EventDayPresence" (
  "reservationId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversedByUserId" TEXT,
  "reversalReason" VARCHAR(160),
  CONSTRAINT "EventDayPresence_pkey" PRIMARY KEY ("reservationId", "day")
);

CREATE INDEX "EventDayPresence_organizationId_eventId_day_idx"
  ON "EventDayPresence"("organizationId", "eventId", "day");

ALTER TABLE "EventDayPresence"
  ADD CONSTRAINT "EventDayPresence_reservationId_eventId_organizationId_fkey"
  FOREIGN KEY ("reservationId", "eventId", "organizationId")
  REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventDayPresence"
  ADD CONSTRAINT "EventDayPresence_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
