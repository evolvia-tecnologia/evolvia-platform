-- Gate A6 — Trabalhos científicos e submissões
-- Migration exclusivamente expansiva: novos enums, tabelas, índices e FKs compostas.

CREATE TYPE "ScientificSubmissionStatus" AS ENUM (
  'DRAFT',
  'INCOMPLETE',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'ACCEPTED_WITH_CHANGES'
);

CREATE TYPE "ScientificReviewMode" AS ENUM (
  'OPEN',
  'SINGLE_BLIND',
  'DOUBLE_BLIND'
);

CREATE TABLE "ScientificSubmissionConfig" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "requireArea" BOOLEAN NOT NULL DEFAULT false,
  "requireSubarea" BOOLEAN NOT NULL DEFAULT false,
  "requireFile" BOOLEAN NOT NULL DEFAULT false,
  "minAuthors" INTEGER NOT NULL DEFAULT 1,
  "maxAuthors" INTEGER,
  "reviewMode" "ScientificReviewMode" NOT NULL DEFAULT 'SINGLE_BLIND',
  "allowCorrections" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificSubmissionConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificSubmissionModality" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "rules" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificSubmissionModality_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificSubmission" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "modalityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "abstractText" TEXT,
  "keywords" JSONB,
  "taxonomyAreaId" TEXT,
  "taxonomySubareaId" TEXT,
  "status" "ScientificSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersion" INTEGER NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificSubmissionAuthor" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "isPresenter" BOOLEAN NOT NULL DEFAULT false,
  "isCorresponding" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificSubmissionAuthor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificSubmissionVersion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "abstractText" TEXT,
  "keywords" JSONB,
  "fileKey" TEXT,
  "contentHash" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScientificSubmissionVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScientificSubmissionConfig_id_eventId_organizationId_key"
  ON "ScientificSubmissionConfig"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificSubmissionConfig_eventId_organizationId_key"
  ON "ScientificSubmissionConfig"("eventId", "organizationId");

CREATE UNIQUE INDEX "ScientificSubmissionModality_id_eventId_organizationId_key"
  ON "ScientificSubmissionModality"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificSubmissionModality_eventId_code_key"
  ON "ScientificSubmissionModality"("eventId", "code");
CREATE INDEX "ScientificSubmissionModality_organizationId_eventId_active_idx"
  ON "ScientificSubmissionModality"("organizationId", "eventId", "active");

CREATE UNIQUE INDEX "ScientificSubmission_id_eventId_organizationId_key"
  ON "ScientificSubmission"("id", "eventId", "organizationId");
CREATE INDEX "ScientificSubmission_organizationId_eventId_status_idx"
  ON "ScientificSubmission"("organizationId", "eventId", "status");
CREATE INDEX "ScientificSubmission_eventId_modalityId_status_idx"
  ON "ScientificSubmission"("eventId", "modalityId", "status");
CREATE INDEX "ScientificSubmission_eventId_taxonomyAreaId_taxonomySubareaId_idx"
  ON "ScientificSubmission"("eventId", "taxonomyAreaId", "taxonomySubareaId");

CREATE UNIQUE INDEX "ScientificSubmissionAuthor_id_eventId_organizationId_key"
  ON "ScientificSubmissionAuthor"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificSubmissionAuthor_eventId_submissionId_personId_key"
  ON "ScientificSubmissionAuthor"("eventId", "submissionId", "personId");
CREATE UNIQUE INDEX "ScientificSubmissionAuthor_eventId_submissionId_sortOrder_key"
  ON "ScientificSubmissionAuthor"("eventId", "submissionId", "sortOrder");
CREATE INDEX "ScientificSubmissionAuthor_organizationId_eventId_personId_idx"
  ON "ScientificSubmissionAuthor"("organizationId", "eventId", "personId");

CREATE UNIQUE INDEX "ScientificSubmissionVersion_id_eventId_organizationId_key"
  ON "ScientificSubmissionVersion"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificSubmissionVersion_eventId_submissionId_versionNumber_key"
  ON "ScientificSubmissionVersion"("eventId", "submissionId", "versionNumber");
CREATE INDEX "ScientificSubmissionVersion_organizationId_eventId_submissionId_idx"
  ON "ScientificSubmissionVersion"("organizationId", "eventId", "submissionId");

ALTER TABLE "ScientificSubmissionConfig"
  ADD CONSTRAINT "ScientificSubmissionConfig_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificSubmissionModality"
  ADD CONSTRAINT "ScientificSubmissionModality_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificSubmission"
  ADD CONSTRAINT "ScientificSubmission_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificSubmission"
  ADD CONSTRAINT "ScientificSubmission_modalityId_eventId_organizationId_fkey"
  FOREIGN KEY ("modalityId", "eventId", "organizationId") REFERENCES "ScientificSubmissionModality"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScientificSubmission"
  ADD CONSTRAINT "ScientificSubmission_taxonomyAreaId_eventId_organizationId_fkey"
  FOREIGN KEY ("taxonomyAreaId", "eventId", "organizationId") REFERENCES "ScientificTaxonomyNode"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScientificSubmission"
  ADD CONSTRAINT "ScientificSubmission_taxonomySubareaId_eventId_organizationId_fkey"
  FOREIGN KEY ("taxonomySubareaId", "eventId", "organizationId") REFERENCES "ScientificTaxonomyNode"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificSubmissionAuthor"
  ADD CONSTRAINT "ScientificSubmissionAuthor_submissionId_eventId_organizationId_fkey"
  FOREIGN KEY ("submissionId", "eventId", "organizationId") REFERENCES "ScientificSubmission"("id", "eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificSubmissionAuthor"
  ADD CONSTRAINT "ScientificSubmissionAuthor_personId_eventId_organizationId_fkey"
  FOREIGN KEY ("personId", "eventId", "organizationId") REFERENCES "ScientificPerson"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificSubmissionVersion"
  ADD CONSTRAINT "ScientificSubmissionVersion_submissionId_eventId_organizationId_fkey"
  FOREIGN KEY ("submissionId", "eventId", "organizationId") REFERENCES "ScientificSubmission"("id", "eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariantes simples que não dependem de estado externo.
ALTER TABLE "ScientificSubmissionConfig"
  ADD CONSTRAINT "ScientificSubmissionConfig_minAuthors_check" CHECK ("minAuthors" >= 1);
ALTER TABLE "ScientificSubmissionConfig"
  ADD CONSTRAINT "ScientificSubmissionConfig_maxAuthors_check" CHECK ("maxAuthors" IS NULL OR "maxAuthors" >= "minAuthors");
ALTER TABLE "ScientificSubmission"
  ADD CONSTRAINT "ScientificSubmission_currentVersion_check" CHECK ("currentVersion" >= 0);
ALTER TABLE "ScientificSubmissionAuthor"
  ADD CONSTRAINT "ScientificSubmissionAuthor_sortOrder_check" CHECK ("sortOrder" >= 1);
ALTER TABLE "ScientificSubmissionVersion"
  ADD CONSTRAINT "ScientificSubmissionVersion_versionNumber_check" CHECK ("versionNumber" >= 1);
