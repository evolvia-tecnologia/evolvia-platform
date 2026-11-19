-- CreateEnum
CREATE TYPE "OperatorGrantEventKind" AS ENUM ('GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CredentialPrintEventKind" AS ENUM ('ISSUED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "EventOperatorGrantEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "OperatorGrantEventKind" NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOperatorGrantEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOperatorGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOperatorGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCredentialPrint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "kind" "CredentialPrintEventKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCredentialPrint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventOperatorGrantEvent_organizationId_eventId_occurredAt_idx" ON "EventOperatorGrantEvent"("organizationId", "eventId", "occurredAt");

-- CreateIndex
CREATE INDEX "EventOperatorGrantEvent_eventId_targetUserId_action_idx" ON "EventOperatorGrantEvent"("eventId", "targetUserId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "EventOperatorGrant_eventId_targetUserId_action_key" ON "EventOperatorGrant"("eventId", "targetUserId", "action");

-- CreateIndex
CREATE INDEX "EventOperatorGrant_organizationId_eventId_targetUserId_idx" ON "EventOperatorGrant"("organizationId", "eventId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCredentialPrint_eventId_reservationId_kind_sequence_key" ON "EventCredentialPrint"("eventId", "reservationId", "kind", "sequence");

-- CreateIndex
CREATE INDEX "EventCredentialPrint_organizationId_eventId_occurredAt_idx" ON "EventCredentialPrint"("organizationId", "eventId", "occurredAt");

-- CreateIndex
CREATE INDEX "EventCredentialPrint_eventId_reservationId_kind_idx" ON "EventCredentialPrint"("eventId", "reservationId", "kind");

-- AddForeignKey
ALTER TABLE "EventOperatorGrantEvent" ADD CONSTRAINT "EventOperatorGrantEvent_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOperatorGrant" ADD CONSTRAINT "EventOperatorGrant_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCredentialPrint" ADD CONSTRAINT "EventCredentialPrint_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Expand-only: three new tables, nenhuma coluna alterada e nenhum dado
-- retroagido. Nenhum evento existente recebe permissao por esta migration: a
-- tabela de concessoes nasce vazia, e o filtro de autorizacao so passa a valer
-- em evento que tenha a capacidade 'operator_scoped_access' ativa. Rolando a
-- aplicacao para tras, as tres tabelas podem ficar: nada as le.
--
-- A chave estrangeira composta ("eventId", "organizationId") -> Event("id",
-- "organizationId") e o isolamento multi-tenant imposto pelo BANCO: uma
-- concessao nao consegue apontar para evento de outra organizacao, porque o par
-- precisa existir junto em Event.

-- Validacoes que nao dependem do catalogo de acoes (o catalogo vive no codigo,
-- em apps/api/src/operator-capability-policy.ts, de proposito: enum de Postgres
-- exigiria uma migration por acao nova).
ALTER TABLE "EventOperatorGrantEvent" ADD CONSTRAINT "operator_grant_event_reason_check"
  CHECK (btrim("reason") <> '');
ALTER TABLE "EventOperatorGrantEvent" ADD CONSTRAINT "operator_grant_event_action_check"
  CHECK (btrim("action") <> '');
ALTER TABLE "EventOperatorGrant" ADD CONSTRAINT "operator_grant_action_check"
  CHECK (btrim("action") <> '');
ALTER TABLE "EventCredentialPrint" ADD CONSTRAINT "credential_print_sequence_check"
  CHECK ("sequence" >= 1);

-- Tentativa nao e conclusao: 'ISSUED' e a emissao do conteudo da etiqueta e
-- 'CONFIRMED' e a confirmacao de que saiu impresso. Quem decide se ja houve
-- impressao conta APENAS 'CONFIRMED', para que uma previa nao gaste a primeira
-- impressao de ninguem nem passe a exigir permissao de reimpressao.

-- Historico imutavel imposto pelo banco, e nao por convencao: as duas razoes
-- append-only recusam UPDATE e DELETE. Uma revogacao e uma linha NOVA em
-- "EventOperatorGrantEvent"; a concessao ativa correspondente sai de
-- "EventOperatorGrant", que e projecao e pode ser reconstruida da razao.
--
-- Nao conflita com o Prisma: gatilhos e funcoes ficam fora do modelo, entao
-- `prisma migrate diff` nao acusa deriva por causa deles. Nao conflita com
-- exclusao de evento: as chaves estrangeiras acima sao ON DELETE RESTRICT, logo
-- nao existe cascata que tentasse apagar estas linhas.
CREATE OR REPLACE FUNCTION evolvia_registro_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutavel: %.% nao admite %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER "event_operator_grant_event_immutable"
  BEFORE UPDATE OR DELETE ON "EventOperatorGrantEvent"
  FOR EACH ROW EXECUTE FUNCTION evolvia_registro_imutavel();

CREATE TRIGGER "event_credential_print_immutable"
  BEFORE UPDATE OR DELETE ON "EventCredentialPrint"
  FOR EACH ROW EXECUTE FUNCTION evolvia_registro_imutavel();
