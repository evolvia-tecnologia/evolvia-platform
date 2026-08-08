-- Gate A3 — estrutura científica
-- Migration expansiva: adiciona somente enums, tabelas, índices e FKs.

CREATE TYPE "ScientificPersonStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ScientificTaxonomyLevel" AS ENUM ('AREA', 'SUBAREA', 'TOPIC');

CREATE TABLE "ScientificPerson" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "institution" TEXT,
  "orcid" TEXT,
  "notes" TEXT,
  "status" "ScientificPersonStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificPerson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificRole" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificPersonRole" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScientificPersonRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificCommittee" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificCommittee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificCommitteeMembership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "committeeId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "roleId" TEXT,
  "isChair" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificCommitteeMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificTaxonomyNode" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "parentId" TEXT,
  "level" "ScientificTaxonomyLevel" NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificTaxonomyNode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScientificPerson_id_eventId_organizationId_key"
  ON "ScientificPerson"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificPerson_eventId_email_key"
  ON "ScientificPerson"("eventId", "email");
CREATE INDEX "ScientificPerson_organizationId_eventId_status_idx"
  ON "ScientificPerson"("organizationId", "eventId", "status");
CREATE INDEX "ScientificPerson_eventId_name_idx"
  ON "ScientificPerson"("eventId", "name");

CREATE UNIQUE INDEX "ScientificRole_id_eventId_organizationId_key"
  ON "ScientificRole"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificRole_eventId_code_key"
  ON "ScientificRole"("eventId", "code");
CREATE INDEX "ScientificRole_organizationId_eventId_label_idx"
  ON "ScientificRole"("organizationId", "eventId", "label");

CREATE UNIQUE INDEX "ScientificPersonRole_eventId_personId_roleId_key"
  ON "ScientificPersonRole"("eventId", "personId", "roleId");
CREATE INDEX "ScientificPersonRole_organizationId_eventId_idx"
  ON "ScientificPersonRole"("organizationId", "eventId");

CREATE UNIQUE INDEX "ScientificCommittee_id_eventId_organizationId_key"
  ON "ScientificCommittee"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificCommittee_eventId_code_key"
  ON "ScientificCommittee"("eventId", "code");
CREATE INDEX "ScientificCommittee_organizationId_eventId_name_idx"
  ON "ScientificCommittee"("organizationId", "eventId", "name");

CREATE UNIQUE INDEX "ScientificCommitteeMembership_eventId_committeeId_personId_key"
  ON "ScientificCommitteeMembership"("eventId", "committeeId", "personId");
CREATE INDEX "ScientificCommitteeMembership_organizationId_eventId_roleId_idx"
  ON "ScientificCommitteeMembership"("organizationId", "eventId", "roleId");

CREATE UNIQUE INDEX "ScientificTaxonomyNode_id_eventId_organizationId_key"
  ON "ScientificTaxonomyNode"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificTaxonomyNode_eventId_code_key"
  ON "ScientificTaxonomyNode"("eventId", "code");
CREATE INDEX "ScientificTaxonomyNode_organizationId_eventId_level_sortOrder_idx"
  ON "ScientificTaxonomyNode"("organizationId", "eventId", "level", "sortOrder");
CREATE INDEX "ScientificTaxonomyNode_eventId_parentId_idx"
  ON "ScientificTaxonomyNode"("eventId", "parentId");

ALTER TABLE "ScientificPerson"
  ADD CONSTRAINT "ScientificPerson_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificRole"
  ADD CONSTRAINT "ScientificRole_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificCommittee"
  ADD CONSTRAINT "ScientificCommittee_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificTaxonomyNode"
  ADD CONSTRAINT "ScientificTaxonomyNode_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificPersonRole"
  ADD CONSTRAINT "ScientificPersonRole_personId_eventId_organizationId_fkey"
  FOREIGN KEY ("personId", "eventId", "organizationId")
  REFERENCES "ScientificPerson"("id", "eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificPersonRole"
  ADD CONSTRAINT "ScientificPersonRole_roleId_eventId_organizationId_fkey"
  FOREIGN KEY ("roleId", "eventId", "organizationId")
  REFERENCES "ScientificRole"("id", "eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificCommitteeMembership"
  ADD CONSTRAINT "ScientificCommitteeMembership_committeeId_eventId_organizationId_fkey"
  FOREIGN KEY ("committeeId", "eventId", "organizationId")
  REFERENCES "ScientificCommittee"("id", "eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificCommitteeMembership"
  ADD CONSTRAINT "ScientificCommitteeMembership_personId_eventId_organizationId_fkey"
  FOREIGN KEY ("personId", "eventId", "organizationId")
  REFERENCES "ScientificPerson"("id", "eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificCommitteeMembership"
  ADD CONSTRAINT "ScientificCommitteeMembership_roleId_eventId_organizationId_fkey"
  FOREIGN KEY ("roleId", "eventId", "organizationId")
  REFERENCES "ScientificRole"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificTaxonomyNode"
  ADD CONSTRAINT "ScientificTaxonomyNode_parentId_eventId_organizationId_fkey"
  FOREIGN KEY ("parentId", "eventId", "organizationId")
  REFERENCES "ScientificTaxonomyNode"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
