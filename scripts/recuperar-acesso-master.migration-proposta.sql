-- PROPOSTA de migration ADITIVA para a janela de inscricao de autenticador.
--
-- NAO E UMA MIGRATION APLICADA. Este arquivo existe para revisao do @Work, que
-- detem o lock do schema compartilhado (#677). Se aprovado, o @Work move o
-- conteudo para `apps/api/prisma/migrations/<timestamp>_platform_master_enrollment_window/`
-- e acrescenta o modelo correspondente a `apps/api/prisma/platform-master-identity.prisma`.
--
-- Por que ADITIVA: nenhuma coluna existente muda, nenhuma e removida, nenhum
-- dado e reescrito. Rollback e `DROP TABLE` + `DROP TYPE`, sem perda de dado
-- anterior a migration.
--
-- Por que tabela nova, e nao reuso de `pendingChallenge*`:
--   aquelas tres colunas guardam a cerimonia EM CURSO. A janela precisa
--   sobreviver ATE a cerimonia comecar, e a cerimonia sobrescreve
--   `pendingChallenge`. Usar as mesmas colunas faria a abertura da cerimonia
--   destruir a autorizacao que a permitiu.
--
-- Por que `secretDigest` e UNIQUE: duas janelas nunca compartilham segredo, e o
-- consumo de uso unico tem uma chave natural para o UPDATE condicional
-- (`SET consumedAt = now() WHERE secretDigest = $1 AND consumedAt IS NULL`),
-- que e o que torna o consumo atomico entre instancias da API.

CREATE TYPE "PlatformEnrollmentPurpose" AS ENUM ('BOOTSTRAP', 'RECOVERY');

CREATE TABLE "PlatformMasterEnrollmentWindow" (
  "id"            TEXT NOT NULL,
  "identityId"    TEXT NOT NULL,
  -- sha256(segredo:finalidade:identityId), em hexadecimal. 64 caracteres fixos.
  "secretDigest"  CHAR(64) NOT NULL,
  "purpose"       "PlatformEnrollmentPurpose" NOT NULL,
  "openedByNote"  VARCHAR(200) NOT NULL,
  "correlationId" VARCHAR(64) NOT NULL,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "consumedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformMasterEnrollmentWindow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformMasterEnrollmentWindow_secretDigest_key"
  ON "PlatformMasterEnrollmentWindow"("secretDigest");

CREATE INDEX "PlatformMasterEnrollmentWindow_identityId_expiresAt_idx"
  ON "PlatformMasterEnrollmentWindow"("identityId", "expiresAt");

-- O digest tem de ser hexadecimal de 64. Sem isto, um valor truncado gravado
-- por engano aceitaria comparacao por prefixo em algum chamador futuro.
ALTER TABLE "PlatformMasterEnrollmentWindow"
  ADD CONSTRAINT "PlatformMasterEnrollmentWindow_digest_shape"
  CHECK ("secretDigest" ~ '^[0-9a-f]{64}$');

-- Janela consumida nao pode ter sido consumida antes de existir.
ALTER TABLE "PlatformMasterEnrollmentWindow"
  ADD CONSTRAINT "PlatformMasterEnrollmentWindow_consumo_coerente"
  CHECK ("consumedAt" IS NULL OR "consumedAt" >= "createdAt");

-- Sem ON DELETE CASCADE de proposito: apagar identidade Master nao e operacao
-- prevista, e cascata silenciosa apagaria o rastro de que houve inscricao.
ALTER TABLE "PlatformMasterEnrollmentWindow"
  ADD CONSTRAINT "PlatformMasterEnrollmentWindow_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "PlatformMasterIdentity"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
