-- Expande a auditoria para o consumo do token sem remover evidência existente.
ALTER TYPE "PasswordRecoveryAuditOutcome"
ADD VALUE IF NOT EXISTS 'RESET_COMPLETED';

ALTER TYPE "PasswordRecoveryAuditOutcome"
ADD VALUE IF NOT EXISTS 'RESET_REJECTED';

ALTER TABLE "PasswordRecoveryAuditEvent"
DROP CONSTRAINT "PasswordRecoveryAuditEvent_action_check";

ALTER TABLE "PasswordRecoveryAuditEvent"
ADD CONSTRAINT "PasswordRecoveryAuditEvent_action_check"
CHECK ("action" IN ('password_recovery.request', 'password_recovery.reset'));
