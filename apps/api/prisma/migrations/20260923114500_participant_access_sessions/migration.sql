CREATE TABLE IF NOT EXISTS "ParticipantAccessSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParticipantAccessSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParticipantAccessSession_reservationId_eventId_organizationId_fkey"
    FOREIGN KEY ("reservationId", "eventId", "organizationId")
    REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParticipantAccessSession_tokenHash_key" ON "ParticipantAccessSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "ParticipantAccessSession_scope_idx" ON "ParticipantAccessSession"("organizationId", "eventId", "reservationId");
CREATE INDEX IF NOT EXISTS "ParticipantAccessSession_expiry_idx" ON "ParticipantAccessSession"("expiresAt", "revokedAt");
