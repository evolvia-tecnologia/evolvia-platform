-- Expande a allowlist da auditoria pública para a verificação de e-mail.
-- Os resultados já existem no enum; nenhum dado ou evidência é removido.
ALTER TABLE "PasswordRecoveryAuditEvent"
DROP CONSTRAINT "PasswordRecoveryAuditEvent_action_check";

ALTER TABLE "PasswordRecoveryAuditEvent"
ADD CONSTRAINT "PasswordRecoveryAuditEvent_action_check"
CHECK (
  "action" IN (
    'password_recovery.request',
    'password_recovery.reset',
    'email_verification.request'
  )
);
