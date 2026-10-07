ALTER TABLE "OrganizationLegalProfile" ADD COLUMN "asaasWalletId" VARCHAR(36);
ALTER TABLE "EventFinancialResponsibility" ADD COLUMN "feeBearer" VARCHAR(16) NOT NULL DEFAULT 'ORGANIZER';
ALTER TABLE "EventRegistrationCheckout" ADD COLUMN "commissionSnapshot" JSONB;
