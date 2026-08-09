-- Gate A7 — Avaliação científica
-- Migration exclusivamente expansiva: novos enums, tabelas, índices, checks e FKs compostas.
-- Nenhuma estrutura A3–A6 é removida ou reescrita.

CREATE TYPE "ScientificReviewAssignmentStatus" AS ENUM (
  'ASSIGNED',
  'IN_PROGRESS',
  'SUBMITTED',
  'CANCELLED'
);

CREATE TYPE "ScientificReviewConflictStatus" AS ENUM (
  'PENDING',
  'CLEAR',
  'CONFLICT'
);

CREATE TYPE "ScientificReviewRecommendation" AS ENUM (
  'ACCEPT',
  'REJECT',
  'CHANGES'
);

CREATE TABLE "ScientificReviewCriterion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "minScore" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificReviewCriterion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificReviewAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "reviewerPersonId" TEXT NOT NULL,
  "assignmentRound" INTEGER NOT NULL DEFAULT 1,
  "status" "ScientificReviewAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "conflictStatus" "ScientificReviewConflictStatus" NOT NULL DEFAULT 'PENDING',
  "conflictReason" TEXT,
  "dueAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificReviewAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificReview" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "recommendation" "ScientificReviewRecommendation",
  "authorComment" TEXT,
  "confidentialComment" TEXT,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScientificReviewScore" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificReviewScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScientificReviewCriterion_id_eventId_organizationId_key"
  ON "ScientificReviewCriterion"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificReviewCriterion_eventId_code_key"
  ON "ScientificReviewCriterion"("eventId", "code");
CREATE INDEX "ScientificReviewCriterion_organizationId_eventId_active_sortOrder_idx"
  ON "ScientificReviewCriterion"("organizationId", "eventId", "active", "sortOrder");

CREATE UNIQUE INDEX "ScientificReviewAssignment_id_eventId_organizationId_key"
  ON "ScientificReviewAssignment"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificReviewAssignment_eventId_submissionId_versionId_reviewerPersonId_assignmentRound_key"
  ON "ScientificReviewAssignment"("eventId", "submissionId", "versionId", "reviewerPersonId", "assignmentRound");
CREATE INDEX "ScientificReviewAssignment_organizationId_eventId_reviewerPersonId_status_idx"
  ON "ScientificReviewAssignment"("organizationId", "eventId", "reviewerPersonId", "status");
CREATE INDEX "ScientificReviewAssignment_eventId_submissionId_versionId_status_idx"
  ON "ScientificReviewAssignment"("eventId", "submissionId", "versionId", "status");

CREATE UNIQUE INDEX "ScientificReview_id_eventId_organizationId_key"
  ON "ScientificReview"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificReview_assignmentId_eventId_organizationId_key"
  ON "ScientificReview"("assignmentId", "eventId", "organizationId");
CREATE INDEX "ScientificReview_organizationId_eventId_submittedAt_idx"
  ON "ScientificReview"("organizationId", "eventId", "submittedAt");

CREATE UNIQUE INDEX "ScientificReviewScore_id_eventId_organizationId_key"
  ON "ScientificReviewScore"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificReviewScore_eventId_reviewId_criterionId_key"
  ON "ScientificReviewScore"("eventId", "reviewId", "criterionId");
CREATE INDEX "ScientificReviewScore_organizationId_eventId_criterionId_idx"
  ON "ScientificReviewScore"("organizationId", "eventId", "criterionId");

ALTER TABLE "ScientificReviewCriterion"
  ADD CONSTRAINT "ScientificReviewCriterion_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificReviewAssignment"
  ADD CONSTRAINT "ScientificReviewAssignment_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificReviewAssignment"
  ADD CONSTRAINT "ScientificReviewAssignment_submissionId_eventId_organizationId_fkey"
  FOREIGN KEY ("submissionId", "eventId", "organizationId") REFERENCES "ScientificSubmission"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScientificReviewAssignment"
  ADD CONSTRAINT "ScientificReviewAssignment_versionId_eventId_organizationId_fkey"
  FOREIGN KEY ("versionId", "eventId", "organizationId") REFERENCES "ScientificSubmissionVersion"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScientificReviewAssignment"
  ADD CONSTRAINT "ScientificReviewAssignment_reviewerPersonId_eventId_organizationId_fkey"
  FOREIGN KEY ("reviewerPersonId", "eventId", "organizationId") REFERENCES "ScientificPerson"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificReview"
  ADD CONSTRAINT "ScientificReview_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificReview"
  ADD CONSTRAINT "ScientificReview_assignmentId_eventId_organizationId_fkey"
  FOREIGN KEY ("assignmentId", "eventId", "organizationId") REFERENCES "ScientificReviewAssignment"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScientificReviewScore"
  ADD CONSTRAINT "ScientificReviewScore_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificReviewScore"
  ADD CONSTRAINT "ScientificReviewScore_reviewId_eventId_organizationId_fkey"
  FOREIGN KEY ("reviewId", "eventId", "organizationId") REFERENCES "ScientificReview"("id", "eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScientificReviewScore"
  ADD CONSTRAINT "ScientificReviewScore_criterionId_eventId_organizationId_fkey"
  FOREIGN KEY ("criterionId", "eventId", "organizationId") REFERENCES "ScientificReviewCriterion"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariantes locais e determinísticas. Regras que dependem de outras linhas
-- (autoria, versão pertencente ao trabalho e escala do critério) são também
-- validadas pelo domínio/serviço A7 antes da persistência.
ALTER TABLE "ScientificReviewCriterion"
  ADD CONSTRAINT "ScientificReviewCriterion_score_range_check"
  CHECK ("minScore" <= "maxScore");
ALTER TABLE "ScientificReviewCriterion"
  ADD CONSTRAINT "ScientificReviewCriterion_weight_check"
  CHECK ("weight" > 0);
ALTER TABLE "ScientificReviewAssignment"
  ADD CONSTRAINT "ScientificReviewAssignment_round_check"
  CHECK ("assignmentRound" >= 1);
ALTER TABLE "ScientificReviewScore"
  ADD CONSTRAINT "ScientificReviewScore_value_finite_check"
  CHECK (isfinite("value"));
