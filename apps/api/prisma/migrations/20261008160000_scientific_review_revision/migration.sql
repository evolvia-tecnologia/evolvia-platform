-- Versão imutável do parecer retomado. Não apaga notas nem outras atribuições.

CREATE TABLE "ScientificReviewRevision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "recommendation" "ScientificReviewRecommendation",
  "overallScore" DOUBLE PRECISION,
  "authorComment" TEXT,
  "confidentialComment" TEXT,
  "rubric" JSONB NOT NULL,
  "scores" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScientificReviewRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScientificReviewRevision_id_eventId_organizationId_key" ON "ScientificReviewRevision"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "ScientificReviewRevision_assignmentId_versionNumber_key" ON "ScientificReviewRevision"("assignmentId", "versionNumber");
CREATE INDEX "ScientificReviewRevision_organizationId_eventId_assignmentId_idx" ON "ScientificReviewRevision"("organizationId", "eventId", "assignmentId");

ALTER TABLE "ScientificReviewRevision"
  ADD CONSTRAINT "ScientificReviewRevision_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificReviewRevision"
  ADD CONSTRAINT "ScientificReviewRevision_assignmentId_eventId_organizationId_fkey"
  FOREIGN KEY ("assignmentId", "eventId", "organizationId") REFERENCES "ScientificReviewAssignment"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
