-- Moderação de eventos pela plataforma (#665).
-- Aditiva: nenhuma tabela existente é alterada, nenhum dado é reescrito.
-- Evento sem linha em "PlatformEventModeration" continua se comportando como
-- antes, o que torna esta migration inofensiva para o que já está no ar.

CREATE TYPE "PlatformModerationState" AS ENUM ('ATIVO', 'SUSPENSO', 'REMOVIDO');
CREATE TYPE "PlatformModerationAction" AS ENUM ('SUSPENDER', 'LIBERAR', 'REMOVER', 'RESTAURAR');
CREATE TYPE "PlatformModerationClass" AS ENUM (
  'FRAUDE_SUSPEITA', 'VIOLACAO_DE_REGRA', 'CONDUTA',
  'ORDEM_JUDICIAL', 'PEDIDO_DO_ORGANIZADOR', 'OUTRO'
);

CREATE TABLE "PlatformEventModeration" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "organizationId" VARCHAR(64) NOT NULL,
  "state" "PlatformModerationState" NOT NULL DEFAULT 'ATIVO',
  "previousState" "PlatformModerationState",
  "originalEventStatus" VARCHAR(32),
  "lastAction" "PlatformModerationAction",
  "lastClassification" "PlatformModerationClass",
  "lastReason" VARCHAR(200) NOT NULL DEFAULT '',
  "lastCaseRef" VARCHAR(64) NOT NULL DEFAULT '',
  "lastActorUserId" VARCHAR(64) NOT NULL DEFAULT '',
  "lastApproverUserId" VARCHAR(64) NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformEventModeration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformEventModeration_eventId_key" ON "PlatformEventModeration"("eventId");
CREATE INDEX "PlatformEventModeration_state_updatedAt_idx" ON "PlatformEventModeration"("state", "updatedAt");
CREATE INDEX "PlatformEventModeration_organizationId_state_idx" ON "PlatformEventModeration"("organizationId", "state");

-- Invariante do estado, imposta pelo banco e não só pelo módulo: fora de ATIVO
-- a fotografia do status original é obrigatória. Sem ela, "liberar" não teria
-- para onde voltar, e um rascunho suspenso poderia reaparecer publicado.
ALTER TABLE "PlatformEventModeration"
  ADD CONSTRAINT "PlatformEventModeration_fotografia_obrigatoria"
  CHECK ("state" = 'ATIVO' OR "originalEventStatus" IS NOT NULL);

-- Em ATIVO não sobra fotografia: estado limpo é estado sem resíduo.
ALTER TABLE "PlatformEventModeration"
  ADD CONSTRAINT "PlatformEventModeration_ativo_sem_fotografia"
  CHECK ("state" <> 'ATIVO' OR "originalEventStatus" IS NULL);

CREATE TABLE "PlatformEventModerationEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "organizationId" VARCHAR(64) NOT NULL,
  "action" "PlatformModerationAction" NOT NULL,
  "fromState" "PlatformModerationState" NOT NULL,
  "toState" "PlatformModerationState" NOT NULL,
  "eventStatusBefore" VARCHAR(32) NOT NULL,
  "eventStatusAfter" VARCHAR(32) NOT NULL,
  "originalEventStatus" VARCHAR(32),
  "classification" "PlatformModerationClass" NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "caseRef" VARCHAR(64) NOT NULL,
  -- VARCHAR(64) para acompanhar "approverUserId" aqui e "lastActorUserId" na
  -- tabela irmã. Era TEXT, e a inconsistência foi apontada na revisão da #691.
  -- O limite é seguro e medido: cuid tem 25 caracteres e o ator sistêmico
  -- "sistema:bootstrap-master" tem 24, com teste exigindo margem. Não há ganho
  -- de armazenamento — pg_column_size do mesmo valor é idêntico em text e em
  -- varchar(64) —, o ganho é consistência e limite explícito.
  "actorUserId" VARCHAR(64) NOT NULL,
  "approverUserId" VARCHAR(64) NOT NULL DEFAULT '',
  "correlationId" VARCHAR(64) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformEventModerationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformEventModerationEvent_eventId_occurredAt_idx" ON "PlatformEventModerationEvent"("eventId", "occurredAt");
CREATE INDEX "PlatformEventModerationEvent_occurredAt_idx" ON "PlatformEventModerationEvent"("occurredAt");
CREATE INDEX "PlatformEventModerationEvent_action_occurredAt_idx" ON "PlatformEventModerationEvent"("action", "occurredAt");

-- Remover exige segunda aprovação, e de pessoa diferente do ator. A separação
-- de funções fica imposta pelo banco, para que nenhum caminho de escrita futuro
-- consiga gravar uma remoção aprovada pelo próprio autor.
ALTER TABLE "PlatformEventModerationEvent"
  ADD CONSTRAINT "PlatformEventModerationEvent_remocao_exige_segunda_aprovacao"
  CHECK (
    "action" <> 'REMOVER'
    OR ("approverUserId" <> '' AND "approverUserId" <> "actorUserId")
  );

-- A razão é append-only. Sem UPDATE e sem DELETE: reverter é registro novo.
CREATE OR REPLACE FUNCTION "platform_moderation_event_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PlatformEventModerationEvent e append-only: reverter uma moderacao e um registro novo, nao uma alteracao do anterior.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformEventModerationEvent_sem_update"
  BEFORE UPDATE ON "PlatformEventModerationEvent"
  FOR EACH ROW EXECUTE FUNCTION "platform_moderation_event_append_only"();

CREATE TRIGGER "PlatformEventModerationEvent_sem_delete"
  BEFORE DELETE ON "PlatformEventModerationEvent"
  FOR EACH ROW EXECUTE FUNCTION "platform_moderation_event_append_only"();
