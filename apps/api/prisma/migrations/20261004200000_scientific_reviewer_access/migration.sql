-- Acesso do avaliador e nota única do parecer.
-- Não altera trabalhos já enviados.

ALTER TABLE "ScientificReview"
  ADD COLUMN "overallScore" DOUBLE PRECISION;

ALTER TABLE "ScientificReview"
  ADD CONSTRAINT "ScientificReview_overall_score_check"
  CHECK ("overallScore" IS NULL OR "overallScore" BETWEEN 0 AND 10);

CREATE TABLE "ScientificReviewerAccess" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScientificReviewerAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScientificReviewerAccess_tokenHash_key" ON "ScientificReviewerAccess"("tokenHash");
CREATE INDEX "ScientificReviewerAccess_organizationId_eventId_personId_idx" ON "ScientificReviewerAccess"("organizationId", "eventId", "personId");
CREATE INDEX "ScientificReviewerAccess_eventId_expiresAt_idx" ON "ScientificReviewerAccess"("eventId", "expiresAt");

ALTER TABLE "ScientificReviewerAccess"
  ADD CONSTRAINT "ScientificReviewerAccess_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScientificReviewerAccess"
  ADD CONSTRAINT "ScientificReviewerAccess_personId_eventId_organizationId_fkey"
  FOREIGN KEY ("personId", "eventId", "organizationId") REFERENCES "ScientificPerson"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
