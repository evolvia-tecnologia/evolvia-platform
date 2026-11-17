-- Fila de espera da atividade, separada da fila do lote. Somente aditiva; rollback:
-- manter a tabela, o tipo e as linhas já gravadas. Não apagar dado de operação.

CREATE TYPE "EventActivityWaitlistStatus" AS ENUM ('WAITING', 'LEFT', 'PROMOTED');

CREATE TABLE "EventActivityWaitlistEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "status" "EventActivityWaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "promotedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventActivityWaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivityWaitlist_reservation_activity_key"
  ON "EventActivityWaitlistEntry"("reservationId", "activityId");
CREATE INDEX "ActivityWaitlist_event_queue_idx"
  ON "EventActivityWaitlistEntry"("organizationId", "eventId", "status", "queuedAt");

ALTER TABLE "EventActivityWaitlistEntry"
  ADD CONSTRAINT "ActivityWaitlist_reservation_fkey"
  FOREIGN KEY ("reservationId", "eventId", "organizationId")
  REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventActivityWaitlistEntry"
  ADD CONSTRAINT "ActivityWaitlist_activity_fkey"
  FOREIGN KEY ("activityId", "eventId", "organizationId")
  REFERENCES "ScientificProgramActivity"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventActivityWaitlistEntry"
  ADD CONSTRAINT "ActivityWaitlist_event_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
