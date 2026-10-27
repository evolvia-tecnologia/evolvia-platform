-- A validação depende do snapshot criado em20261025170000.
-- Expansão já adicionou a coluna; dados históricos permanecem nulos.
ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_back_snapshot_check"
  CHECK ("snapshotBackBody" IS NULL OR ("snapshotVersion" IS NOT NULL AND "snapshotVersion" = 1));
