-- Verso opcional e lote auditado do certificado de participação.
-- Migration aditiva. O rollback operacional deixa de chamar o lote e esvazia o verso.
-- Não apaga certificado, carga horária nem auditoria já gravados.

ALTER TABLE "EventCertificateSetting" ADD COLUMN "backBody" VARCHAR(4000);

CREATE TABLE "EventCertificateBatch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "issuedCount" INTEGER NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCertificateBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventCertificateBatch_issuedCount_check" CHECK ("issuedCount" >= 1 AND "issuedCount" <= 40)
);

CREATE INDEX "EventCertificateBatch_organizationId_eventId_createdAt_idx" ON "EventCertificateBatch"("organizationId", "eventId", "createdAt");

ALTER TABLE "EventCertificateBatch" ADD CONSTRAINT "EventCertificateBatch_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventCertificate" ADD COLUMN "batchId" TEXT;

CREATE INDEX "EventCertificate_batchId_idx" ON "EventCertificate"("batchId");

ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "EventCertificateBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
