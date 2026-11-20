CREATE TYPE "PlatformMasterRole" AS ENUM ('OWNER', 'DELEGADO');
CREATE TYPE "PlatformMasterStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "PlatformCeremonyKind" AS ENUM ('REGISTRATION', 'AUTHENTICATION');

CREATE TABLE "PlatformMasterIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformMasterRole" NOT NULL,
    "status" "PlatformMasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "provisionedByNote" VARCHAR(200) NOT NULL,
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pendingChallenge" VARCHAR(255),
    "pendingChallengeKind" "PlatformCeremonyKind",
    "pendingChallengeExpires" TIMESTAMP(3),
    CONSTRAINT "PlatformMasterIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformWebAuthnCredential" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "credentialId" VARCHAR(255) NOT NULL,
    "publicKey" VARCHAR(1024) NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "label" VARCHAR(80) NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" VARCHAR(120) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "PlatformWebAuthnCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformMasterSession" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "secondFactorAt" TIMESTAMP(3) NOT NULL,
    "stepUpAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformMasterSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformMasterIdentity_userId_key" ON "PlatformMasterIdentity"("userId");
CREATE UNIQUE INDEX "PlatformMasterIdentity_pendingChallenge_key" ON "PlatformMasterIdentity"("pendingChallenge");
CREATE INDEX "PlatformMasterIdentity_role_status_idx" ON "PlatformMasterIdentity"("role", "status");
CREATE UNIQUE INDEX "PlatformWebAuthnCredential_credentialId_key" ON "PlatformWebAuthnCredential"("credentialId");
CREATE INDEX "PlatformWebAuthnCredential_identityId_createdAt_idx" ON "PlatformWebAuthnCredential"("identityId", "createdAt");
CREATE UNIQUE INDEX "PlatformMasterSession_tokenHash_key" ON "PlatformMasterSession"("tokenHash");
CREATE INDEX "PlatformMasterSession_identityId_createdAt_idx" ON "PlatformMasterSession"("identityId", "createdAt");
CREATE INDEX "PlatformMasterSession_expiresAt_idx" ON "PlatformMasterSession"("expiresAt");
