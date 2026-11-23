ALTER TABLE "SandboxRefundOperation" ADD COLUMN "nextCheckAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "SandboxRefundOperation_recovery_idx" ON "SandboxRefundOperation" ("organizationId", status, "nextCheckAt", "paymentId");
