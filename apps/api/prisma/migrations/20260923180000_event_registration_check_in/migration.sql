CREATE TABLE "EventRegistrationCheckIn" (
    "reservationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventRegistrationCheckIn_pkey" PRIMARY KEY ("reservationId")
);

CREATE INDEX "EventRegistrationCheckIn_organizationId_eventId_checkedInAt_idx"
    ON "EventRegistrationCheckIn"("organizationId", "eventId", "checkedInAt");

ALTER TABLE "EventRegistrationCheckIn"
    ADD CONSTRAINT "EventRegistrationCheckIn_reservationId_eventId_organizationId_fkey"
    FOREIGN KEY ("reservationId", "eventId", "organizationId")
    REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationCheckIn"
    ADD CONSTRAINT "EventRegistrationCheckIn_eventId_organizationId_fkey"
    FOREIGN KEY ("eventId", "organizationId")
    REFERENCES "Event"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
