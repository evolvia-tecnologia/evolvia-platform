-- Configurações de submissão e avaliação que o organizador ainda não podia gravar.
-- A migração só adiciona colunas e restrições. Trabalhos, pareceres e arquivos existentes permanecem.

CREATE TYPE "ScientificAbstractCounterUnit" AS ENUM ('CHARACTERS', 'WORDS');
CREATE TYPE "ScientificEvaluationStyle" AS ENUM ('ANALYTIC', 'SYNTHETIC');

ALTER TABLE "ScientificSubmissionConfig"
  ADD COLUMN "maxPresenters" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "collectScientificName" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "collectInstitutionAddress" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "collectFundingAgency" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "collectConflictOfInterest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireSubmitterAsFirstAuthor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requirePresentationSuggestion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "collectTypedAbstract" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "collectReferences" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "abstractCounterUnit" "ScientificAbstractCounterUnit" NOT NULL DEFAULT 'CHARACTERS',
  ADD COLUMN "abstractMin" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "abstractMax" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN "showProceedingsAuthorization" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "proceedingsAuthorizationPt" VARCHAR(2000),
  ADD COLUMN "proceedingsAuthorizationEs" VARCHAR(2000),
  ADD COLUMN "proceedingsAuthorizationEn" VARCHAR(2000),
  ADD COLUMN "reviewersPerSubmission" INTEGER,
  ADD COLUMN "coordinatorDecidesStatus" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "evaluationStyle" "ScientificEvaluationStyle" NOT NULL DEFAULT 'ANALYTIC',
  ADD COLUMN "acceptedWorkUploadEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "acceptedWorkUploadDeadline" TIMESTAMP(3);

ALTER TABLE "ScientificSubmissionConfig"
  ADD CONSTRAINT "ScientificSubmissionConfig_extended_rules_check"
  CHECK (
    "maxPresenters" BETWEEN 1 AND 20
    AND "abstractMin" BETWEEN 0 AND 20000
    AND "abstractMax" BETWEEN "abstractMin" AND 20000
    AND ("reviewersPerSubmission" IS NULL OR "reviewersPerSubmission" BETWEEN 1 AND 10)
    AND (
      "showProceedingsAuthorization" = false
      OR char_length(btrim("proceedingsAuthorizationPt")) BETWEEN 10 AND 2000
    )
  );

ALTER TABLE "ScientificSubmission"
  ADD COLUMN "presentationFormatCode" VARCHAR(40),
  ADD COLUMN "fundingAgency" VARCHAR(160),
  ADD COLUMN "conflictDeclared" BOOLEAN,
  ADD COLUMN "conflictDetail" VARCHAR(500),
  ADD COLUMN "referencesText" TEXT,
  ADD COLUMN "proceedingsAuthorizationAcceptedAt" TIMESTAMP(3);

ALTER TABLE "ScientificSubmissionAuthor"
  ADD COLUMN "scientificName" VARCHAR(120),
  ADD COLUMN "institutionAddress" VARCHAR(240);

ALTER TABLE "ScientificSubmissionVersion"
  ADD COLUMN "presentationFormatCode" VARCHAR(40),
  ADD COLUMN "fundingAgency" VARCHAR(160),
  ADD COLUMN "conflictDeclared" BOOLEAN,
  ADD COLUMN "conflictDetail" VARCHAR(500),
  ADD COLUMN "referencesText" TEXT;
