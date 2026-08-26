-- Fundação expansiva: eventos existentes permanecem sem presunção geográfica.
-- O organizador confirma um timezone IANA antes de uma nova publicação.
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "timeZone" TEXT;
