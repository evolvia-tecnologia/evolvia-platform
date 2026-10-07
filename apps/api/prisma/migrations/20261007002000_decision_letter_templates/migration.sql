ALTER TABLE "ScientificSubmissionConfig" ADD COLUMN IF NOT EXISTS "acceptanceLetterBody" VARCHAR(4000);
ALTER TABLE "ScientificSubmissionConfig" ADD COLUMN IF NOT EXISTS "rejectionLetterBody" VARCHAR(4000);
