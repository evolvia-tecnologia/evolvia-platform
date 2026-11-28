ALTER TABLE "FiscalReceiptDraft"
  ADD COLUMN "sandboxProvider" VARCHAR(20),
  ADD COLUMN "sandboxPreparedAt" TIMESTAMP(3),
  ADD CONSTRAINT "FiscalReceiptDraft_sandbox_preparation_check"
    CHECK (("sandboxProvider" IS NULL AND "sandboxPreparedAt" IS NULL)
      OR ("sandboxProvider" IS NOT NULL AND "sandboxProvider" IN ('enotas', 'notazz') AND "sandboxPreparedAt" IS NOT NULL));
