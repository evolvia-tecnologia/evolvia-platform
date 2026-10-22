-- CreateEnum
CREATE TYPE "ParticipantDocumentKind" AS ENUM ('CPF', 'PASSPORT');

-- CreateEnum
CREATE TYPE "ParticipantHistoryGrantSource" AS ENUM ('RECOVERY_CONSENT');

-- AlterTable
ALTER TABLE "ParticipantIdentityLink" ADD COLUMN "documentKind" "ParticipantDocumentKind",
ADD COLUMN "issuerCountry" CHAR(2),
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "historyGrantSource" "ParticipantHistoryGrantSource",
ADD COLUMN "grantedByUserId" TEXT,
ADD COLUMN "grantorEmailHash" CHAR(64);

-- CreateTable
CREATE TABLE "ParticipantHistoryRecovery" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "identityHash" CHAR(64) NOT NULL,
    "documentKind" "ParticipantDocumentKind" NOT NULL,
    "issuerCountry" CHAR(2),
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipantHistoryRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantHistoryRecovery_tokenHash_key" ON "ParticipantHistoryRecovery"("tokenHash");

-- CreateIndex
CREATE INDEX "ParticipantHistoryRecovery_targetUserId_consumedAt_idx" ON "ParticipantHistoryRecovery"("targetUserId", "consumedAt");

-- CreateIndex
CREATE INDEX "ParticipantHistoryRecovery_requesterUserId_createdAt_idx" ON "ParticipantHistoryRecovery"("requesterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ParticipantIdentityLink_identityHash_verifiedAt_idx" ON "ParticipantIdentityLink"("identityHash", "verifiedAt");

-- CreateIndex
CREATE INDEX "ParticipantIdentityLink_identityHash_grantorEmailHash_idx" ON "ParticipantIdentityLink"("identityHash", "grantorEmailHash");

-- AddForeignKey
ALTER TABLE "ParticipantHistoryRecovery" ADD CONSTRAINT "ParticipantHistoryRecovery_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantHistoryRecovery" ADD CONSTRAINT "ParticipantHistoryRecovery_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
