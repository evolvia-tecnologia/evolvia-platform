-- Agenda pessoal: a vaga é separada da presença no credenciamento.

CREATE TYPE "EventActivityEnrollmentStatus" AS ENUM ('ENROLLED', 'CANCELLED');

CREATE TABLE "EventActivityEnrollment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "status" "EventActivityEnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventActivityEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventActivityEnrollment_reservationId_activityId_key"
  ON "EventActivityEnrollment"("reservationId", "activityId");
CREATE UNIQUE INDEX "EventActivityEnrollment_id_eventId_organizationId_key"
  ON "EventActivityEnrollment"("id", "eventId", "organizationId");
CREATE INDEX "EventActivityEnrollment_organizationId_eventId_activityId_status_idx"
  ON "EventActivityEnrollment"("organizationId", "eventId", "activityId", "status");

ALTER TABLE "EventActivityEnrollment"
  ADD CONSTRAINT "EventActivityEnrollment_reservationId_eventId_organizationId_fkey"
  FOREIGN KEY ("reservationId", "eventId", "organizationId")
  REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventActivityEnrollment"
  ADD CONSTRAINT "EventActivityEnrollment_activityId_eventId_organizationId_fkey"
  FOREIGN KEY ("activityId", "eventId", "organizationId")
  REFERENCES "ScientificProgramActivity"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventActivityEnrollment"
  ADD CONSTRAINT "EventActivityEnrollment_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
