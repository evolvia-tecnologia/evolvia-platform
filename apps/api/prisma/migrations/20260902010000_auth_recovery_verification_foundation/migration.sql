-- Fundação expansiva e inerte de recuperação de senha e verificação de e-mail.
-- Contas existentes permanecem não verificadas; não há backfill nem destruição.

ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

ALTER TABLE "User"
ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"
  ON "PasswordResetToken"("tokenHash");

CREATE UNIQUE INDEX "PasswordResetToken_one_unresolved_per_user_key"
  ON "PasswordResetToken"("userId")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;

CREATE INDEX "PasswordResetToken_userId_createdAt_idx"
  ON "PasswordResetToken"("userId", "createdAt");

CREATE INDEX "PasswordResetToken_expiresAt_idx"
  ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key"
  ON "EmailVerificationToken"("tokenHash");

CREATE INDEX "EmailVerificationToken_userId_createdAt_idx"
  ON "EmailVerificationToken"("userId", "createdAt");

CREATE INDEX "EmailVerificationToken_expiresAt_idx"
  ON "EmailVerificationToken"("expiresAt");

CREATE UNIQUE INDEX "EmailVerificationToken_one_unresolved_per_user_key"
  ON "EmailVerificationToken"("userId")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "EmailVerificationToken"
  ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PasswordRecoveryRateLimitBucket" (
  "id" TEXT NOT NULL,
  "dimension" VARCHAR(16) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PasswordRecoveryRateLimitBucket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordRecoveryRateLimitBucket_dimension_check"
    CHECK ("dimension" IN ('ORIGIN', 'IDENTITY')),
  CONSTRAINT "PasswordRecoveryRateLimitBucket_request_count_check"
    CHECK ("requestCount" > 0)
);

CREATE UNIQUE INDEX "PasswordRecoveryRateLimitBucket_dimension_keyHash_windowStartedAt_key"
  ON "PasswordRecoveryRateLimitBucket"("dimension", "keyHash", "windowStartedAt");

CREATE INDEX "PasswordRecoveryRateLimitBucket_expiresAt_idx"
  ON "PasswordRecoveryRateLimitBucket"("expiresAt");

CREATE TYPE "PasswordRecoveryAuditOutcome" AS ENUM (
  'IGNORED',
  'DELIVERED',
  'DELIVERY_FAILED',
  'PERSISTENCE_FAILED',
  'RATE_LIMITED',
  'VERIFICATION_COMPLETED',
  'VERIFICATION_REJECTED',
  'RESET_COMPLETED',
  'RESET_REJECTED'
);

CREATE TABLE "PasswordRecoveryAuditEvent" (
  "id" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL DEFAULT 'password_recovery.request',
  "outcome" "PasswordRecoveryAuditOutcome" NOT NULL,
  "subjectUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordRecoveryAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordRecoveryAuditEvent_action_check"
    CHECK (
      "action" IN (
        'password_recovery.request',
        'password_recovery.reset',
        'email_verification.request',
        'email_verification.confirm'
      )
    )
);

CREATE INDEX "PasswordRecoveryAuditEvent_outcome_createdAt_idx"
  ON "PasswordRecoveryAuditEvent"("outcome", "createdAt");

CREATE INDEX "PasswordRecoveryAuditEvent_subjectUserId_createdAt_idx"
  ON "PasswordRecoveryAuditEvent"("subjectUserId", "createdAt");

ALTER TABLE "PasswordRecoveryAuditEvent"
  ADD CONSTRAINT "PasswordRecoveryAuditEvent_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
