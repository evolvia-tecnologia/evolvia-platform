-- Expande a auditoria para a confirmação atômica do e-mail.
-- A troca da allowlist não remove tabela, coluna, registro ou evidência.
ALTER TYPE "PasswordRecoveryAuditOutcome"
ADD VALUE IF NOT EXISTS 'VERIFICATION_COMPLETED';

ALTER TYPE "PasswordRecoveryAuditOutcome"
ADD VALUE IF NOT EXISTS 'VERIFICATION_REJECTED';

ALTER TABLE "PasswordRecoveryAuditEvent"
DROP CONSTRAINT "PasswordRecoveryAuditEvent_action_check";

ALTER TABLE "PasswordRecoveryAuditEvent"
ADD CONSTRAINT "PasswordRecoveryAuditEvent_action_check"
CHECK (
  "action" IN (
    'password_recovery.request',
    'password_recovery.reset',
    'email_verification.request',
    'email_verification.confirm'
  )
);
