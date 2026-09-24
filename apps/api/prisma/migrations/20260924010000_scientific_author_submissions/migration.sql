ALTER TABLE "ScientificSubmission"
    ADD COLUMN "ownerReservationId" TEXT,
    ADD COLUMN "submissionKeyHash" CHAR(64),
    ADD COLUMN "submissionPayloadHash" CHAR(64);

CREATE UNIQUE INDEX "ScientificSubmission_eventId_ownerReservationId_submissionKeyHash_key"
    ON "ScientificSubmission"("eventId", "ownerReservationId", "submissionKeyHash");

CREATE INDEX "ScientificSubmission_organizationId_eventId_ownerReservationId_status_idx"
    ON "ScientificSubmission"("organizationId", "eventId", "ownerReservationId", "status");

ALTER TABLE "ScientificSubmission"
    ADD CONSTRAINT "ScientificSubmission_ownerReservationId_eventId_organizationId_fkey"
    FOREIGN KEY ("ownerReservationId", "eventId", "organizationId")
    REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
