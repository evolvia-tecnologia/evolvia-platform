-- Gate 11: questionário por evento e uma resposta auditável por inscrição confirmada.
-- Migration aditiva; rollback operacional desliga a configuração sem apagar respostas.

CREATE TABLE "EventEvaluationConfig" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "title" VARCHAR(120) NOT NULL,
  "questions" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventEvaluationConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventEvaluationResponse" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "idempotencyKeyHash" CHAR(64) NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventEvaluationResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventEvaluationConfig_eventId_organizationId_key" ON "EventEvaluationConfig"("eventId", "organizationId");
CREATE UNIQUE INDEX "EventEvaluationResponse_eventId_reservationId_key" ON "EventEvaluationResponse"("eventId", "reservationId");
CREATE UNIQUE INDEX "EventEvaluationResponse_reservationId_idempotencyKeyHash_key" ON "EventEvaluationResponse"("reservationId", "idempotencyKeyHash");
CREATE INDEX "EventEvaluationResponse_organizationId_eventId_submittedAt_idx" ON "EventEvaluationResponse"("organizationId", "eventId", "submittedAt");

ALTER TABLE "EventEvaluationConfig" ADD CONSTRAINT "EventEvaluationConfig_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventEvaluationResponse" ADD CONSTRAINT "EventEvaluationResponse_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventEvaluationResponse" ADD CONSTRAINT "EventEvaluationResponse_reservationId_eventId_organizationId_fkey"
  FOREIGN KEY ("reservationId", "eventId", "organizationId") REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
