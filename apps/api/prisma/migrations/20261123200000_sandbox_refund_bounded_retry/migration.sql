-- The first provider POST is durable. Only a definitive rejection can
-- permit one more explicitly authorized attempt; timeout stays non-repeatable.
-- Zero means a refund was discovered in Asaas without a local POST.
ALTER TABLE "SandboxRefundOperation"
  DROP CONSTRAINT "SandboxRefundOperation_attempts_check",
  ADD CONSTRAINT "SandboxRefundOperation_attempts_check" CHECK ("attempts" IN (0, 1, 2));
