CREATE TABLE "SandboxRefundOperation" (
  "requestId" TEXT PRIMARY KEY REFERENCES "RegistrationRefundRequest"("id") ON DELETE RESTRICT,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "attempts" INTEGER NOT NULL DEFAULT 1 CHECK ("attempts" = 1),
  "status" TEXT NOT NULL DEFAULT 'PROCESSING' CHECK ("status" IN ('PROCESSING','FAILED','RECONCILED')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "reconciledAt" TIMESTAMPTZ
);
