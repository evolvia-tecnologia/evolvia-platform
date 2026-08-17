-- Buckets persistentes e pseudonimizados para limitar abuso na recuperação.
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
