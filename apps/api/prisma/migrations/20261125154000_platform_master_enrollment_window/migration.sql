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
  "revokedAt"     TIMESTAMP(3),
  "challengeHash" CHAR(64),
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
