CREATE TABLE "EventRegistrationPaymentReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "sellerSnapshot" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventRegistrationPaymentReceipt_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EventRegistrationCheckout" ADD COLUMN "sellerSnapshot" JSONB;
CREATE UNIQUE INDEX "EventRegistrationPaymentReceipt_reservationId_key" ON "EventRegistrationPaymentReceipt"("reservationId");
CREATE UNIQUE INDEX "EventRegistrationPaymentReceipt_checkoutId_key" ON "EventRegistrationPaymentReceipt"("checkoutId");
CREATE UNIQUE INDEX "EventRegistrationPaymentReceipt_reservationId_eventId_organizationId_key" ON "EventRegistrationPaymentReceipt"("reservationId","eventId","organizationId");
CREATE UNIQUE INDEX "EventRegistrationPaymentReceipt_checkoutId_eventId_organizationId_key" ON "EventRegistrationPaymentReceipt"("checkoutId","eventId","organizationId");
CREATE UNIQUE INDEX "EventRegistrationPaymentReceipt_number_key" ON "EventRegistrationPaymentReceipt"("number");
CREATE INDEX "EventRegistrationPaymentReceipt_organizationId_eventId_issuedAt_idx" ON "EventRegistrationPaymentReceipt"("organizationId", "eventId", "issuedAt");
ALTER TABLE "EventRegistrationPaymentReceipt" ADD CONSTRAINT "EventRegistrationPaymentReceipt_reservationId_eventId_organizationId_fkey" FOREIGN KEY ("reservationId","eventId","organizationId") REFERENCES "EventRegistrationReservation"("id","eventId","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationPaymentReceipt" ADD CONSTRAINT "EventRegistrationPaymentReceipt_checkoutId_eventId_organizationId_fkey" FOREIGN KEY ("checkoutId","eventId","organizationId") REFERENCES "EventRegistrationCheckout"("id","eventId","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
