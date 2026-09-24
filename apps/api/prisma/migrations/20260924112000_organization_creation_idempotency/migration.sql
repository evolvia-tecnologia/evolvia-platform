-- Persist a completed creation command atomically with its organization.
-- No existing organization is modified; rollback of application code can leave this table intact.
CREATE TABLE "OrganizationCreationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationCreationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationCreationRequest_userId_keyHash_key"
    ON "OrganizationCreationRequest"("userId", "keyHash");
CREATE INDEX "OrganizationCreationRequest_organizationId_idx"
    ON "OrganizationCreationRequest"("organizationId");

ALTER TABLE "OrganizationCreationRequest"
    ADD CONSTRAINT "OrganizationCreationRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationCreationRequest"
    ADD CONSTRAINT "OrganizationCreationRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
