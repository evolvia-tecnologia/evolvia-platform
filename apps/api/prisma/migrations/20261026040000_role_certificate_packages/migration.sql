-- AlterTable
ALTER TABLE "EventCertificateRoleSetting" ADD COLUMN     "backBody" VARCHAR(4000);

-- AlterTable
ALTER TABLE "EventRoleCertificate" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "snapshotBackBody" VARCHAR(4000);

-- CreateTable
CREATE TABLE "EventRoleCertificateBatch" (
    "id" VARCHAR(36) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "issuedCount" INTEGER NOT NULL,
    "alreadyIssuedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRoleCertificateBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventRoleCertificateBatch_organizationId_eventId_role_creat_idx" ON "EventRoleCertificateBatch"("organizationId", "eventId", "role", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRoleCertificateBatch_id_eventId_organizationId_role_key" ON "EventRoleCertificateBatch"("id", "eventId", "organizationId", "role");

-- CreateIndex
CREATE INDEX "EventRoleCertificate_batchId_idx" ON "EventRoleCertificate"("batchId");

-- AddForeignKey
ALTER TABLE "EventRoleCertificate" ADD CONSTRAINT "EventRoleCertificate_batchId_eventId_organizationId_role_fkey" FOREIGN KEY ("batchId", "eventId", "organizationId", "role") REFERENCES "EventRoleCertificateBatch"("id", "eventId", "organizationId", "role") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRoleCertificateBatch" ADD CONSTRAINT "EventRoleCertificateBatch_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Expand-only: no history is backfilled from a mutable setting. Keep these
-- nullable columns and batch records when rolling the application back.
ALTER TABLE "EventRoleCertificateBatch" ADD CONSTRAINT "role_certificate_batch_counts_check"
  CHECK ("issuedCount" BETWEEN 0 AND 40 AND "alreadyIssuedCount" BETWEEN 0 AND 40
    AND "issuedCount" + "alreadyIssuedCount" <= 40 AND "skippedCount" >= 0);
ALTER TABLE "EventRoleCertificateBatch" ADD CONSTRAINT "role_certificate_batch_role_check"
  CHECK ("role" IN ('activity', 'approved_submission', 'presentation', 'guest', 'reviewer'));
ALTER TABLE "EventRoleCertificate" ADD CONSTRAINT "role_certificate_back_snapshot_check"
  CHECK ("snapshotBackBody" IS NULL OR ("snapshotVersion" IS NOT NULL AND "snapshotVersion" = 1
    AND "snapshotEventName" IS NOT NULL AND "snapshotTitle" IS NOT NULL AND "snapshotBody" IS NOT NULL));
