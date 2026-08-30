ALTER TABLE "ScientificSubmissionConfig"
  ADD COLUMN "maxSubmissionsPerAuthor" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "requirePresenter" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requireCorrespondingAuthor" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requireAuthorInstitution" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "titleMaxLength" INTEGER NOT NULL DEFAULT 250,
  ADD COLUMN "minKeywords" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "maxKeywords" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "presentationFormats" JSONB;

ALTER TABLE "ScientificSubmissionConfig"
  ADD CONSTRAINT "ScientificSubmissionConfig_submission_rules_check"
  CHECK (
    "maxSubmissionsPerAuthor" BETWEEN 1 AND 100
    AND "minAuthors" BETWEEN 1 AND 100
    AND ("maxAuthors" IS NULL OR "maxAuthors" BETWEEN "minAuthors" AND 100)
    AND "titleMaxLength" BETWEEN 50 AND 1000
    AND "minKeywords" BETWEEN 0 AND 20
    AND "maxKeywords" BETWEEN "minKeywords" AND 20
  );
