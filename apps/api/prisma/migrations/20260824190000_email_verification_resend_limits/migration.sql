-- Expande a auditoria para diferenciar bloqueios esperados de reenvio.
-- Nenhuma tabela, coluna ou evidência existente é removida.
ALTER TYPE "PasswordRecoveryAuditOutcome"
ADD VALUE IF NOT EXISTS 'RATE_LIMITED';
