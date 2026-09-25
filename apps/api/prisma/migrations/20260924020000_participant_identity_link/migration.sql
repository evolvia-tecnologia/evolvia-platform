CREATE TABLE "ParticipantIdentityLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "identityHash" CHAR(64) NOT NULL,
  "emailHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParticipantIdentityLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ParticipantIdentityLink_identityHash_emailHash_key" ON "ParticipantIdentityLink"("identityHash", "emailHash");
CREATE INDEX "ParticipantIdentityLink_userId_emailHash_idx" ON "ParticipantIdentityLink"("userId", "emailHash");
ALTER TABLE "ParticipantIdentityLink" ADD CONSTRAINT "ParticipantIdentityLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
