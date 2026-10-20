-- Expand only. No global person updates and no backfill of historical identity.
-- Rollback: revert the application; keep nullable columns to preserve saved work.
ALTER TABLE "ScientificSubmissionAuthor"
  ADD COLUMN "nameSnapshot" VARCHAR(120),
  ADD COLUMN "institutionSnapshot" VARCHAR(160);
