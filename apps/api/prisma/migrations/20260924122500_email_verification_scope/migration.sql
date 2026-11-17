ALTER TABLE "EmailVerificationToken"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "eventId" TEXT,
  ADD COLUMN "participantIdentityHash" CHAR(64),
  ADD COLUMN "participantEmailHash" CHAR(64);
