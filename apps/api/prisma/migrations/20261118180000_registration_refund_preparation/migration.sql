ALTER TABLE "RegistrationRefundRequest"
  ADD COLUMN "preparedAmountCents" INTEGER,
  ADD COLUMN "preparedCheckoutId" TEXT,
  ADD COLUMN "preparedOrderCheckoutId" TEXT,
  ADD CONSTRAINT "RefundPreparation_shape" CHECK (
    ("preparedAmountCents" IS NULL AND num_nonnulls("preparedCheckoutId", "preparedOrderCheckoutId") = 0)
    OR ("preparedAmountCents" IS NOT NULL AND "preparedAmountCents" > 0 AND "status" = 'APPROVED'
        AND num_nonnulls("preparedCheckoutId", "preparedOrderCheckoutId") = 1)
  ),
  ADD CONSTRAINT "RefundPreparation_single_fkey"
    FOREIGN KEY ("preparedCheckoutId", "eventId", "organizationId")
    REFERENCES "EventRegistrationCheckout" ("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RefundPreparation_order_fkey"
    FOREIGN KEY ("preparedOrderCheckoutId", "eventId", "organizationId")
    REFERENCES "EventRegistrationOrderCheckout" ("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RefundPreparation_single_idx" ON "RegistrationRefundRequest" ("preparedCheckoutId");
CREATE INDEX "RefundPreparation_order_idx" ON "RegistrationRefundRequest" ("preparedOrderCheckoutId");
