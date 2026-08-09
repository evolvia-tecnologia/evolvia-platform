-- Gate A5 — Programação científica
-- Migration exclusivamente expansiva. Nenhuma estrutura A3/A4 é removida ou renomeada.

CREATE TYPE "ScientificProgramSpaceKind" AS ENUM ('ROOM', 'AUDITORIUM', 'STAGE', 'VIRTUAL', 'OTHER');
CREATE TYPE "ScientificProgramActivityStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW');

CREATE TABLE "ScientificProgramSpace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "capacity" INTEGER,
    "kind" "ScientificProgramSpaceKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScientificProgramSpace_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScientificProgramSpace_capacity_check" CHECK ("capacity" IS NULL OR "capacity" >= 0)
);

CREATE TABLE "ScientificProgramActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "description" TEXT,
    "spaceId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "ScientificProgramActivityStatus" NOT NULL DEFAULT 'DRAFT',
    "taxonomyAreaId" TEXT,
    "taxonomySubareaId" TEXT,
    "taxonomyTopicId" TEXT,
    "operationalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScientificProgramActivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScientificProgramActivity_interval_check" CHECK ("endAt" > "startAt")
);

CREATE TABLE "ScientificProgramParticipant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "participationType" "ScientificParticipationType" NOT NULL,
    "customRoleLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScientificProgramParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScientificProgramSpace_id_eventId_organizationId_key"
ON "ScientificProgramSpace"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificProgramSpace_eventId_name_key"
ON "ScientificProgramSpace"("eventId", "name");
CREATE INDEX "ScientificProgramSpace_organizationId_eventId_active_idx"
ON "ScientificProgramSpace"("organizationId", "eventId", "active");

CREATE UNIQUE INDEX "ScientificProgramActivity_id_eventId_organizationId_key"
ON "ScientificProgramActivity"("id", "eventId", "organizationId");
CREATE INDEX "ScientificProgramActivity_organizationId_eventId_startAt_idx"
ON "ScientificProgramActivity"("organizationId", "eventId", "startAt");
CREATE INDEX "ScientificProgramActivity_eventId_spaceId_startAt_idx"
ON "ScientificProgramActivity"("eventId", "spaceId", "startAt");
CREATE INDEX "ScientificProgramActivity_eventId_status_idx"
ON "ScientificProgramActivity"("eventId", "status");

CREATE UNIQUE INDEX "ScientificProgramParticipant_eventId_activityId_personId_participationType_key"
ON "ScientificProgramParticipant"("eventId", "activityId", "personId", "participationType");
CREATE UNIQUE INDEX "ScientificProgramParticipant_id_eventId_organizationId_key"
ON "ScientificProgramParticipant"("id", "eventId", "organizationId");
CREATE INDEX "ScientificProgramParticipant_organizationId_eventId_personId_idx"
ON "ScientificProgramParticipant"("organizationId", "eventId", "personId");
CREATE INDEX "ScientificProgramParticipant_eventId_activityId_idx"
ON "ScientificProgramParticipant"("eventId", "activityId");

ALTER TABLE "ScientificProgramSpace"
ADD CONSTRAINT "ScientificProgramSpace_eventId_organizationId_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificProgramActivity"
ADD CONSTRAINT "ScientificProgramActivity_eventId_organizationId_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificProgramActivity"
ADD CONSTRAINT "ScientificProgramActivity_spaceId_eventId_organizationId_fkey"
FOREIGN KEY ("spaceId", "eventId", "organizationId") REFERENCES "ScientificProgramSpace"("id", "eventId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificProgramActivity"
ADD CONSTRAINT "ScientificProgramActivity_taxonomyAreaId_eventId_organizationId_fkey"
FOREIGN KEY ("taxonomyAreaId", "eventId", "organizationId") REFERENCES "ScientificTaxonomyNode"("id", "eventId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificProgramActivity"
ADD CONSTRAINT "ScientificProgramActivity_taxonomySubareaId_eventId_organizationId_fkey"
FOREIGN KEY ("taxonomySubareaId", "eventId", "organizationId") REFERENCES "ScientificTaxonomyNode"("id", "eventId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificProgramActivity"
ADD CONSTRAINT "ScientificProgramActivity_taxonomyTopicId_eventId_organizationId_fkey"
FOREIGN KEY ("taxonomyTopicId", "eventId", "organizationId") REFERENCES "ScientificTaxonomyNode"("id", "eventId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificProgramParticipant"
ADD CONSTRAINT "ScientificProgramParticipant_eventId_organizationId_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificProgramParticipant"
ADD CONSTRAINT "ScientificProgramParticipant_activityId_eventId_organizationId_fkey"
FOREIGN KEY ("activityId", "eventId", "organizationId") REFERENCES "ScientificProgramActivity"("id", "eventId", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificProgramParticipant"
ADD CONSTRAINT "ScientificProgramParticipant_personId_eventId_organizationId_fkey"
FOREIGN KEY ("personId", "eventId", "organizationId") REFERENCES "ScientificPerson"("id", "eventId", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
