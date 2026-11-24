-- G5.8 — expansão aditiva para impedir que réplicas disparem o mesmo e-mail.
-- Nenhuma mudança destrutiva; rollback operacional: desabilitar flag de env
-- e manter a tabela para investigação/reconciliação, sem reenvio cego.
CREATE TABLE "ScientificNoticeDispatch" (
  "idempotencyKey" VARCHAR(64) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PROCESSING',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScientificNoticeDispatch_pkey" PRIMARY KEY ("idempotencyKey"),
  CONSTRAINT "ScientificNoticeDispatch_status_check" CHECK ("status" IN ('PROCESSING', 'ACCEPTED', 'FAILED', 'UNKNOWN')),
  CONSTRAINT "ScientificNoticeDispatch_attempts_check" CHECK ("attempts" BETWEEN 1 AND 3)
);
CREATE INDEX "ScientificNoticeDispatch_scope_idx"
  ON "ScientificNoticeDispatch" ("organizationId", "eventId", "submissionId", "versionNumber");
CREATE INDEX "ScientificNoticeDispatch_status_claimed_idx"
  ON "ScientificNoticeDispatch" ("status", "claimedAt");
