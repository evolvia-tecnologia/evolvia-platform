-- Expand-only: retain the existing legacy checkout FK and add a separate
-- composite FK for grouped orders. No existing webhook or checkout is rewritten.
ALTER TABLE "AsaasCheckoutWebhookEvent"
  ADD COLUMN "orderCheckoutId" TEXT;

CREATE UNIQUE INDEX "EventRegistrationOrderCheckout_id_eventId_organizationId_key"
  ON "EventRegistrationOrderCheckout"("id", "eventId", "organizationId");

ALTER TABLE "AsaasCheckoutWebhookEvent"
  ADD CONSTRAINT "AsaasCheckoutWebhookEvent_orderCheckoutId_eventId_organizationId_fkey"
  FOREIGN KEY ("orderCheckoutId", "eventId", "organizationId")
  REFERENCES "EventRegistrationOrderCheckout"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "AsaasCheckoutWebhookEvent_orderCheckoutId_eventId_organizationId_idx"
  ON "AsaasCheckoutWebhookEvent"("orderCheckoutId", "eventId", "organizationId");

-- Legacy inbox entries can be unscoped before the provider checkout exists.
-- Once scoped, exactly one checkout family must be selected.
ALTER TABLE "AsaasCheckoutWebhookEvent"
  DROP CONSTRAINT "AsaasCheckoutWebhookEvent_scope_check";
ALTER TABLE "AsaasCheckoutWebhookEvent"
  ADD CONSTRAINT "AsaasCheckoutWebhookEvent_scope_check"
  CHECK (
    ("organizationId" IS NULL AND "eventId" IS NULL
      AND "checkoutId" IS NULL AND "orderCheckoutId" IS NULL)
    OR
    ("organizationId" IS NOT NULL AND "eventId" IS NOT NULL
      AND (
        ("checkoutId" IS NOT NULL AND "orderCheckoutId" IS NULL)
        OR ("checkoutId" IS NULL AND "orderCheckoutId" IS NOT NULL)
      ))
  );
