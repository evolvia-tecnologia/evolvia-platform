-- Foto pública do palestrante. Coluna opcional. A página só mostra o endereço
-- quando a pessoa está ativa e o convite está confirmado.

ALTER TABLE "ScientificGuestProfile" ADD COLUMN IF NOT EXISTS "portraitUrl" TEXT;
