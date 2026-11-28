CREATE TABLE "FiscalReceiptDraft" (
    "receiptId" TEXT PRIMARY KEY REFERENCES "EventRegistrationPaymentReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "idempotencyKey" CHAR(64) NOT NULL,
    "municipalityIbgeCode" VARCHAR(7) NOT NULL,
    "serviceCode" VARCHAR(20) NOT NULL,
    "issuerId" VARCHAR(128) NOT NULL,
    "recipientId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
