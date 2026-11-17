-- Verso opcional e lote auditado do certificado de participação.
-- Migration aditiva. O rollback operacional deixa de chamar o lote e esvazia o verso.
-- Não apaga certificado, carga horária nem auditoria já gravados.

ALTER TABLE "EventCertificateSetting" ADD COLUMN "backBody" VARCHAR(4000);

CREATE TABLE "EventCertificateBatch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "issuedCount" INTEGER NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "scannedCount" INTEGER NOT NULL,
  "skippedCount" INTEGER NOT NULL,
  "nextAfterId" TEXT,
  "hours" INTEGER,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCertificateBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventCertificateBatch_issuedCount_check" CHECK ("issuedCount" >= 0 AND "issuedCount" <= 40)
);

CREATE INDEX "EventCertificateBatch_organizationId_eventId_createdAt_idx" ON "EventCertificateBatch"("organizationId", "eventId", "createdAt");

ALTER TABLE "EventCertificateBatch" ADD CONSTRAINT "EventCertificateBatch_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventCertificate" ADD COLUMN "batchId" TEXT;
ALTER TABLE "EventCertificate" ADD COLUMN "snapshotBackBody" VARCHAR(4000);
CREATE UNIQUE INDEX "EventCertificateBatch_id_eventId_organizationId_key" ON "EventCertificateBatch"("id", "eventId", "organizationId");

CREATE INDEX "EventCertificate_batchId_idx" ON "EventCertificate"("batchId");

ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_batchId_fkey"
  FOREIGN KEY ("batchId", "eventId", "organizationId") REFERENCES "EventCertificateBatch"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventCertificateBatch" ADD CONSTRAINT "EventCertificateBatch_counts_check"
  CHECK ("scannedCount" >= 0 AND "scannedCount" <= 400 AND "skippedCount" >= 0 AND "skippedCount" <= "scannedCount" AND "issuedCount" + "skippedCount" = "scannedCount");
ALTER TABLE "EventCertificateBatch" ADD CONSTRAINT "EventCertificateBatch_hours_check"
  CHECK ("hours" IS NULL OR ("hours" >= 1 AND "hours" <= 999));
