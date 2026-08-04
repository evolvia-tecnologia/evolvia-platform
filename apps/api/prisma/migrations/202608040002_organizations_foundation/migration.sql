CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED');
CREATE TYPE "CapabilityStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "WizardSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMembership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "invitedById" TEXT,
  "joinedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventCapability" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "CapabilityStatus" NOT NULL DEFAULT 'ACTIVE',
  "config" JSONB,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventCapability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventWizardSession" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "flowVersion" TEXT NOT NULL DEFAULT 'v1',
  "currentStep" TEXT NOT NULL DEFAULT 'event-type',
  "answers" JSONB NOT NULL DEFAULT '{}',
  "completionPercent" INTEGER NOT NULL DEFAULT 0,
  "status" "WizardSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventWizardSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Event" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Event" ADD COLUMN "createdById" TEXT;

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_createdById_idx" ON "Organization"("createdById");
CREATE INDEX "Organization_status_idx" ON "Organization"("status");
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");
CREATE INDEX "OrganizationMembership_organizationId_role_status_idx" ON "OrganizationMembership"("organizationId", "role", "status");
CREATE INDEX "Event_organizationId_createdAt_idx" ON "Event"("organizationId", "createdAt");
CREATE INDEX "Event_createdById_idx" ON "Event"("createdById");
CREATE UNIQUE INDEX "EventCapability_eventId_code_key" ON "EventCapability"("eventId", "code");
CREATE INDEX "EventCapability_code_status_idx" ON "EventCapability"("code", "status");
CREATE UNIQUE INDEX "EventWizardSession_eventId_flowVersion_key" ON "EventWizardSession"("eventId", "flowVersion");
CREATE INDEX "EventWizardSession_status_lastSavedAt_idx" ON "EventWizardSession"("status", "lastSavedAt");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_eventId_createdAt_idx" ON "AuditLog"("eventId", "createdAt");

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventCapability" ADD CONSTRAINT "EventCapability_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventWizardSession" ADD CONSTRAINT "EventWizardSession_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill determinístico para contas e eventos existentes.
INSERT INTO "Organization" ("id", "name", "slug", "status", "createdById", "createdAt", "updatedAt")
SELECT
  'org_' || substr(md5("id"), 1, 24),
  'Organização de ' || "name",
  'pessoal-' || substr(md5("id"), 1, 16),
  'ACTIVE'::"OrganizationStatus",
  "id",
  "createdAt",
  CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "OrganizationMembership" (
  "id", "organizationId", "userId", "role", "status", "joinedAt", "createdAt", "updatedAt"
)
SELECT
  'mem_' || substr(md5("id"), 1, 24),
  'org_' || substr(md5("id"), 1, 24),
  "id",
  'OWNER'::"MembershipRole",
  'ACTIVE'::"MembershipStatus",
  "createdAt",
  "createdAt",
  CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("organizationId", "userId") DO NOTHING;

UPDATE "Event"
SET
  "organizationId" = 'org_' || substr(md5("ownerId"), 1, 24),
  "createdById" = "ownerId"
WHERE "organizationId" IS NULL;
