CREATE TABLE IF NOT EXISTS "EventStaffCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "duty" VARCHAR(40) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "EventStaffCredential_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventStaffCredential_eventId_organizationId_fkey"
      FOREIGN KEY ("eventId", "organizationId")
      REFERENCES "Event"("id", "organizationId")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventStaffCredential_codeHash_key" ON "EventStaffCredential"("codeHash");
CREATE UNIQUE INDEX IF NOT EXISTS "EventStaffCredential_id_eventId_organizationId_key"
    ON "EventStaffCredential"("id", "eventId", "organizationId");
CREATE INDEX IF NOT EXISTS "EventStaffCredential_organizationId_eventId_active_idx"
    ON "EventStaffCredential"("organizationId", "eventId", "active");

CREATE TABLE IF NOT EXISTS "EventStaffAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT NOT NULL,
    CONSTRAINT "EventStaffAccess_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventStaffAccess_eventId_organizationId_fkey"
      FOREIGN KEY ("eventId", "organizationId")
      REFERENCES "Event"("id", "organizationId")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventStaffAccess_credentialId_eventId_organizationId_fkey"
      FOREIGN KEY ("credentialId", "eventId", "organizationId")
      REFERENCES "EventStaffCredential"("id", "eventId", "organizationId")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EventStaffAccess_organizationId_eventId_accessedAt_idx"
    ON "EventStaffAccess"("organizationId", "eventId", "accessedAt");
CREATE INDEX IF NOT EXISTS "EventStaffAccess_organizationId_eventId_credentialId_idx"
    ON "EventStaffAccess"("organizationId", "eventId", "credentialId");

CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_eventId_action_idx"
    ON "AuditLog"("organizationId", "eventId", "action");

CREATE TABLE IF NOT EXISTS "EventTurnstileKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "keyHint" VARCHAR(8) NOT NULL,
    "shareName" BOOLEAN NOT NULL DEFAULT false,
    "shareTicketType" BOOLEAN NOT NULL DEFAULT false,
    "shareStatus" BOOLEAN NOT NULL DEFAULT false,
    "shareCode" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventTurnstileKey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventTurnstileKey_eventId_organizationId_fkey"
      FOREIGN KEY ("eventId", "organizationId")
      REFERENCES "Event"("id", "organizationId")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventTurnstileKey_keyHash_key" ON "EventTurnstileKey"("keyHash");
CREATE INDEX IF NOT EXISTS "EventTurnstileKey_organizationId_eventId_revokedAt_idx"
    ON "EventTurnstileKey"("organizationId", "eventId", "revokedAt");
