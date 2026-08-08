-- Gate A4 — palestrantes, convidados e convites
-- Migration expansiva: adiciona somente enums, tabela, índices e FKs.

CREATE TYPE "ScientificParticipationType" AS ENUM (
  'SPEAKER',
  'GUEST',
  'MODERATOR',
  'DEBATER',
  'SESSION_CHAIR',
  'OTHER'
);

CREATE TYPE "ScientificInvitationStatus" AS ENUM (
  'DRAFT',
  'PREPARED',
  'SENT',
  'VIEWED',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED'
);

CREATE TABLE "ScientificGuestProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "participationType" "ScientificParticipationType" NOT NULL,
  "customRoleLabel" TEXT,
  "displayName" TEXT,
  "professionalTitle" TEXT,
  "miniBio" TEXT,
  "websiteUrl" TEXT,
  "linkedinUrl" TEXT,
  "internalNotes" TEXT,
  "accessibilityNotes" TEXT,
  "technicalSupportNotes" TEXT,
  "invitationStatus" "ScientificInvitationStatus" NOT NULL DEFAULT 'DRAFT',
  "invitationTokenHash" TEXT,
  "invitationExpiresAt" TIMESTAMP(3),
  "preparedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificGuestProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScientificGuestProfile_invitationTokenHash_key"
  ON "ScientificGuestProfile"("invitationTokenHash");
CREATE UNIQUE INDEX "ScientificGuestProfile_id_eventId_organizationId_key"
  ON "ScientificGuestProfile"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificGuestProfile_personId_eventId_organizationId_key"
  ON "ScientificGuestProfile"("personId", "eventId", "organizationId");
CREATE INDEX "ScientificGuestProfile_organizationId_eventId_invitationStatus_idx"
  ON "ScientificGuestProfile"("organizationId", "eventId", "invitationStatus");
CREATE INDEX "ScientificGuestProfile_eventId_participationType_idx"
  ON "ScientificGuestProfile"("eventId", "participationType");

ALTER TABLE "ScientificGuestProfile"
  ADD CONSTRAINT "ScientificGuestProfile_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificGuestProfile"
  ADD CONSTRAINT "ScientificGuestProfile_personId_eventId_organizationId_fkey"
  FOREIGN KEY ("personId", "eventId", "organizationId")
  REFERENCES "ScientificPerson"("id", "eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
