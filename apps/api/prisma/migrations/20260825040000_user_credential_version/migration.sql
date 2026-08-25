-- Expansão compatível: tokens legados equivalem à versão inicial 0.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "credentialVersion" INTEGER NOT NULL DEFAULT 0;
