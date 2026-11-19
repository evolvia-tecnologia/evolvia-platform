ALTER TABLE "RegistrationRefundRequest"
  ADD COLUMN "sandboxPaymentId" VARCHAR(200),
  ADD CONSTRAINT "RefundSandbox_reference_shape" CHECK (
    "sandboxPaymentId" IS NULL OR
    ("preparedAmountCents" IS NOT NULL AND "sandboxPaymentId" ~ '^pay_[A-Za-z0-9_-]+$')
  );
