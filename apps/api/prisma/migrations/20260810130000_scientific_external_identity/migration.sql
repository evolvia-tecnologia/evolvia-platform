-- A6/A7 external scientific identity foundation.
-- Administrative User identity is intentionally separate from AUTHOR/REVIEWER identity.

CREATE TYPE "ScientificExternalActor" AS ENUM ('AUTHOR', 'REVIEWER');

CREATE TABLE "ScientificExternalCredential" (
    "id" TEXT NOT NULL,
    "actor" "ScientificExternalActor" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "singleUse" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScientificExternalCredential_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScientificExternalCredential_window_check" CHECK ("expiresAt" > "issuedAt"),
    CONSTRAINT "ScientificExternalCredential_revoked_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "issuedAt"),
    CONSTRAINT "ScientificExternalCredential_consumed_check" CHECK ("consumedAt" IS NULL OR ("singleUse" = true AND "consumedAt" >= "issuedAt"))
);

CREATE TABLE "ScientificExternalSession" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "actor" "ScientificExternalActor" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScientificExternalSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScientificExternalSession_window_check" CHECK ("expiresAt" > "issuedAt"),
    CONSTRAINT "ScientificExternalSession_revoked_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "issuedAt")
);

CREATE TABLE "ScientificExternalAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" "ScientificExternalActor" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "credentialId" TEXT,
    "sessionId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScientificExternalAuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScientificExternalAuditLog_reference_check" CHECK ("credentialId" IS NOT NULL OR "sessionId" IS NOT NULL)
);

CREATE UNIQUE INDEX "ScientificExternalCredential_tokenHash_key" ON "ScientificExternalCredential"("tokenHash");
CREATE UNIQUE INDEX "ScientificExternalCredential_scope_key" ON "ScientificExternalCredential"("id", "actor", "organizationId", "eventId", "personId");
CREATE INDEX "ScientificExternalCredential_scope_active_idx" ON "ScientificExternalCredential"("organizationId", "eventId", "personId", "actor", "expiresAt");
CREATE INDEX "ScientificExternalCredential_createdByUserId_idx" ON "ScientificExternalCredential"("createdByUserId");

CREATE UNIQUE INDEX "ScientificExternalSession_sessionHash_key" ON "ScientificExternalSession"("sessionHash");
CREATE UNIQUE INDEX "ScientificExternalSession_scope_key" ON "ScientificExternalSession"("id", "actor", "organizationId", "eventId", "personId");
CREATE INDEX "ScientificExternalSession_scope_active_idx" ON "ScientificExternalSession"("organizationId", "eventId", "personId", "actor", "expiresAt");
CREATE INDEX "ScientificExternalSession_credentialId_idx" ON "ScientificExternalSession"("credentialId");

CREATE INDEX "ScientificExternalAuditLog_scope_occurredAt_idx" ON "ScientificExternalAuditLog"("organizationId", "eventId", "personId", "occurredAt");
CREATE INDEX "ScientificExternalAuditLog_credentialId_idx" ON "ScientificExternalAuditLog"("credentialId");
CREATE INDEX "ScientificExternalAuditLog_sessionId_idx" ON "ScientificExternalAuditLog"("sessionId");

ALTER TABLE "ScientificExternalCredential"
ADD CONSTRAINT "ScientificExternalCredential_event_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificExternalCredential"
ADD CONSTRAINT "ScientificExternalCredential_person_fkey"
FOREIGN KEY ("personId", "eventId", "organizationId") REFERENCES "ScientificPerson"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificExternalCredential"
ADD CONSTRAINT "ScientificExternalCredential_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- This composite FK makes scope escalation impossible at the persistence boundary:
-- a session must preserve credential actor + organization + event + person.
ALTER TABLE "ScientificExternalSession"
ADD CONSTRAINT "ScientificExternalSession_credential_scope_fkey"
FOREIGN KEY ("credentialId", "actor", "organizationId", "eventId", "personId")
REFERENCES "ScientificExternalCredential"("id", "actor", "organizationId", "eventId", "personId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificExternalSession"
ADD CONSTRAINT "ScientificExternalSession_event_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificExternalSession"
ADD CONSTRAINT "ScientificExternalSession_person_fkey"
FOREIGN KEY ("personId", "eventId", "organizationId") REFERENCES "ScientificPerson"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificExternalAuditLog"
ADD CONSTRAINT "ScientificExternalAuditLog_event_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificExternalAuditLog"
ADD CONSTRAINT "ScientificExternalAuditLog_person_fkey"
FOREIGN KEY ("personId", "eventId", "organizationId") REFERENCES "ScientificPerson"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit references are scope-preserving and intentionally non-nullifying.
-- Historical audit rows must never be silently detached from their authentication evidence,
-- and a reference from another actor/organization/event/person is rejected by the database.
ALTER TABLE "ScientificExternalAuditLog"
ADD CONSTRAINT "ScientificExternalAuditLog_credential_scope_fkey"
FOREIGN KEY ("credentialId", "actor", "organizationId", "eventId", "personId")
REFERENCES "ScientificExternalCredential"("id", "actor", "organizationId", "eventId", "personId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificExternalAuditLog"
ADD CONSTRAINT "ScientificExternalAuditLog_session_scope_fkey"
FOREIGN KEY ("sessionId", "actor", "organizationId", "eventId", "personId")
REFERENCES "ScientificExternalSession"("id", "actor", "organizationId", "eventId", "personId")
ON DELETE RESTRICT ON UPDATE CASCADE;
