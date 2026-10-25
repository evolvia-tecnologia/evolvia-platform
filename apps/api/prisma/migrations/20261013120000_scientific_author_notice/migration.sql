-- Aviso de recebimento de cada versão enviada pelo autor. Não guarda e-mail nem texto.

CREATE TYPE "ScientificAuthorNoticeKind" AS ENUM ('SUBMITTED', 'CORRECTED');

CREATE TABLE "ScientificAuthorNotice" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "ownerReservationId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "kind" "ScientificAuthorNoticeKind" NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScientificAuthorNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScientificAuthorNotice_eventId_submissionId_versionNumber_key" ON "ScientificAuthorNotice"("eventId", "submissionId", "versionNumber");
CREATE INDEX "ScientificAuthorNotice_organizationId_eventId_ownerReservationId_recordedAt_idx" ON "ScientificAuthorNotice"("organizationId", "eventId", "ownerReservationId", "recordedAt");

ALTER TABLE "ScientificAuthorNotice"
  ADD CONSTRAINT "ScientificAuthorNotice_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificAuthorNotice"
  ADD CONSTRAINT "ScientificAuthorNotice_submissionId_eventId_organizationId_fkey"
  FOREIGN KEY ("submissionId", "eventId", "organizationId") REFERENCES "ScientificSubmission"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

