CREATE TYPE "PlatformGrantScopeKind" AS ENUM ('GLOBAL', 'ORGANIZACAO', 'EVENTO');
CREATE TYPE "PlatformGrantEventKind" AS ENUM ('GRANTED', 'REVOKED');
CREATE TYPE "PlatformAuditResult" AS ENUM ('ALLOWED', 'DENIED', 'FAILED');

CREATE TABLE "PlatformGrantEvent" (
    "id" TEXT NOT NULL,
    "kind" "PlatformGrantEventKind" NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "scopeKind" "PlatformGrantScopeKind" NOT NULL,
    "organizationId" VARCHAR(64) NOT NULL DEFAULT '',
    "eventId" VARCHAR(64) NOT NULL DEFAULT '',
    "targetUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "correlationId" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformGrantEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformGrant" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "scopeKind" "PlatformGrantScopeKind" NOT NULL,
    "organizationId" VARCHAR(64) NOT NULL DEFAULT '',
    "eventId" VARCHAR(64) NOT NULL DEFAULT '',
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "PlatformGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "scopeKind" "PlatformGrantScopeKind" NOT NULL,
    "organizationId" VARCHAR(64) NOT NULL DEFAULT '',
    "eventId" VARCHAR(64) NOT NULL DEFAULT '',
    "targetUserId" VARCHAR(64) NOT NULL DEFAULT '',
    "reason" VARCHAR(200) NOT NULL,
    "result" "PlatformAuditResult" NOT NULL,
    "changes" JSONB,
    "correlationId" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformGrantEvent_targetUserId_action_occurredAt_idx" ON "PlatformGrantEvent"("targetUserId", "action", "occurredAt");
CREATE INDEX "PlatformGrantEvent_occurredAt_idx" ON "PlatformGrantEvent"("occurredAt");
CREATE UNIQUE INDEX "PlatformGrant_alvo_acao_escopo_key" ON "PlatformGrant"("targetUserId", "action", "scopeKind", "organizationId", "eventId");
CREATE INDEX "PlatformGrant_targetUserId_action_idx" ON "PlatformGrant"("targetUserId", "action");
CREATE INDEX "PlatformGrant_expiresAt_idx" ON "PlatformGrant"("expiresAt");
CREATE INDEX "PlatformAuditLog_occurredAt_idx" ON "PlatformAuditLog"("occurredAt");
CREATE INDEX "PlatformAuditLog_actorUserId_occurredAt_idx" ON "PlatformAuditLog"("actorUserId", "occurredAt");
CREATE INDEX "PlatformAuditLog_eventId_occurredAt_idx" ON "PlatformAuditLog"("eventId", "occurredAt");
CREATE INDEX "PlatformAuditLog_action_occurredAt_idx" ON "PlatformAuditLog"("action", "occurredAt");

ALTER TABLE "PlatformGrantEvent" ADD CONSTRAINT "PlatformGrantEvent_scope_check" CHECK (("scopeKind" = 'GLOBAL' AND "organizationId" = '' AND "eventId" = '') OR ("scopeKind" = 'ORGANIZACAO' AND "organizationId" <> '' AND "eventId" = '') OR ("scopeKind" = 'EVENTO' AND "organizationId" = '' AND "eventId" <> ''));

ALTER TABLE "PlatformGrant" ADD CONSTRAINT "PlatformGrant_scope_check" CHECK (("scopeKind" = 'GLOBAL' AND "organizationId" = '' AND "eventId" = '') OR ("scopeKind" = 'ORGANIZACAO' AND "organizationId" <> '' AND "eventId" = '') OR ("scopeKind" = 'EVENTO' AND "organizationId" = '' AND "eventId" <> ''));
