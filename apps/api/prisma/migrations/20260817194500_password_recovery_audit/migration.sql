-- Auditoria própria do fluxo público, sem exigir organização ou evento.
CREATE TYPE "PasswordRecoveryAuditOutcome" AS ENUM (
  'IGNORED',
  'DELIVERED',
  'DELIVERY_FAILED',
  'PERSISTENCE_FAILED'
);

CREATE TABLE "PasswordRecoveryAuditEvent" (
  "id" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL DEFAULT 'password_recovery.request',
  "outcome" "PasswordRecoveryAuditOutcome" NOT NULL,
  "subjectUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordRecoveryAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordRecoveryAuditEvent_action_check"
    CHECK ("action" = 'password_recovery.request')
);

CREATE INDEX "PasswordRecoveryAuditEvent_outcome_createdAt_idx"
ON "PasswordRecoveryAuditEvent"("outcome", "createdAt");

CREATE INDEX "PasswordRecoveryAuditEvent_subjectUserId_createdAt_idx"
ON "PasswordRecoveryAuditEvent"("subjectUserId", "createdAt");

ALTER TABLE "PasswordRecoveryAuditEvent"
ADD CONSTRAINT "PasswordRecoveryAuditEvent_subjectUserId_fkey"
FOREIGN KEY ("subjectUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
