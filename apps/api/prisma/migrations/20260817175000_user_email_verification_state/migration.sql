-- Estado canônico e opcional de posse do e-mail.
-- Expansiva: contas existentes permanecem não verificadas até confirmação real.
ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
