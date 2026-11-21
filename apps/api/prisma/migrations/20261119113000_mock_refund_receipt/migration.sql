CREATE TABLE "MockRefundReceipt" (
  "requestId" TEXT NOT NULL PRIMARY KEY REFERENCES "RegistrationRefundRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentId" VARCHAR(200) NOT NULL,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciledAt" TIMESTAMP(3)
);
