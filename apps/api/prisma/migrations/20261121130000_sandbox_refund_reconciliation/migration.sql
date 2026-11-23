-- Recovery can observe a provider operation without reserving a local POST.
ALTER TABLE "SandboxRefundOperation"
  DROP CONSTRAINT "SandboxRefundOperation_attempts_check",
  ADD CONSTRAINT "SandboxRefundOperation_attempts_check" CHECK ("attempts" IN (0, 1));
