-- Arte única e textos do certificado de participação.
-- Migration aditiva. O rollback operacional apaga o ponteiro da arte e restaura o texto padrão.
-- Não apaga certificado já emitido.

ALTER TABLE "EventCertificateSetting" ADD COLUMN "title" VARCHAR(240) NOT NULL DEFAULT 'Certificado de participação';
ALTER TABLE "EventCertificateSetting" ADD COLUMN "body" VARCHAR(4000) NOT NULL DEFAULT 'Certificamos que **{NOME}** participou de **{EVENTO}**.';
ALTER TABLE "EventCertificateSetting" ADD COLUMN "artStorageKey" VARCHAR(180);
ALTER TABLE "EventCertificateSetting" ADD COLUMN "artMimeType" VARCHAR(32);
ALTER TABLE "EventCertificateSetting" ADD COLUMN "artByteSize" INTEGER;
ALTER TABLE "EventCertificateSetting" ADD COLUMN "artAltText" VARCHAR(180);
