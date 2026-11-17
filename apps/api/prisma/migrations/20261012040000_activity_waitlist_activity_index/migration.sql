-- Índice da posição por atividade. Somente aditivo; rollback:
-- manter o índice. Não apagar fila nem inscrição já gravadas.

CREATE INDEX IF NOT EXISTS "ActivityWaitlist_activity_queue_idx"
  ON "EventActivityWaitlistEntry"("organizationId", "eventId", "activityId", "status", "queuedAt");
