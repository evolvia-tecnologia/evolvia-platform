-- Additive terms document for the registration consent field.
-- Existing forms and reservations stay valid because every new column is nullable.
CREATE TYPE "RegistrationTermsDocumentState" AS ENUM ('ACTIVE', 'REPLACED');

CREATE TABLE "EventRegistrationTermsDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "checksumSha256" CHAR(64) NOT NULL,
  "version" INTEGER NOT NULL,
  "state" "RegistrationTermsDocumentState" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT NOT NULL,
  "replacedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRegistrationTermsDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventRegistrationTermsDocument_storageKey_key" ON "EventRegistrationTermsDocument"("storageKey");
CREATE UNIQUE INDEX "EventRegistrationTermsDocument_eventId_organizationId_version_key" ON "EventRegistrationTermsDocument"("eventId", "organizationId", "version");
CREATE UNIQUE INDEX "EventRegistrationTermsDocument_id_eventId_organizationId_key" ON "EventRegistrationTermsDocument"("id", "eventId", "organizationId");
CREATE INDEX "EventRegistrationTermsDocument_organizationId_eventId_state_idx" ON "EventRegistrationTermsDocument"("organizationId", "eventId", "state");

ALTER TABLE "EventRegistrationTermsDocument"
  ADD CONSTRAINT "EventRegistrationTermsDocument_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationFormVersion"
  ADD COLUMN "termsDocumentId" TEXT,
  ADD COLUMN "termsDocumentVersion" INTEGER;

ALTER TABLE "EventRegistrationReservation"
  ADD COLUMN "termsDocumentId" TEXT,
  ADD COLUMN "termsDocumentVersion" INTEGER;

ALTER TABLE "EventRegistrationReservation"
  ADD CONSTRAINT "EventRegistrationReservation_termsDocumentId_eventId_organizationId_fkey"
  FOREIGN KEY ("termsDocumentId", "eventId", "organizationId")
  REFERENCES "EventRegistrationTermsDocument"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
