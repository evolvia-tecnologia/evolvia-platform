import { BadRequestException, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import {
  ConfirmedRegistrationNotice,
  IntegrationFoundationPolicyError,
  hashEventApiKey,
  issueEventApiKey,
  normalizeApiKeyLabel,
  normalizePreparationAccountLabel,
  normalizeWebhookUrl,
  publicEventUrl,
  refuseProviderDelivery,
  registrationConfirmedPayload,
  websitePresenceSnippet,
  webhookSignatureHeader,
} from './integration-foundation.policy';
import { INTEGRATION_CATALOG } from './integrations-catalog';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { RegistrationConfirmationMailService } from './registration-confirmation-mail.service';
import { postWebhook } from './webhook-transport';

const WEBHOOK_LIMIT = 3;
const API_KEY_LIMIT = 3;
const API_KEY_DAYS = 90;

type WebhookPoster = (url: string, body: string, headers: Record<string, string>) => Promise<number>;

const defaultPoster: WebhookPoster = postWebhook;

@Injectable()
export class IntegrationFoundationService {
  private post: WebhookPoster = defaultPoster;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    @Optional() private readonly confirmationMail?: RegistrationConfirmationMailService,
  ) {}

  usePoster(poster: WebhookPoster) {
    this.post = poster;
  }

  async listWebhooks(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    const items = await this.prisma.eventOutboundWebhook.findMany({
      where: { eventId: event.id, organizationId: event.organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, enabled: true, createdAt: true, disabledAt: true },
    });
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), disabledAt: item.disabledAt?.toISOString() ?? null })) };
  }

  async createWebhook(userId: string, eventId: string, input: { url?: unknown }) {
    const event = await this.requireEvent(userId, eventId);
    const url = this.normalizeUrl(input?.url);
    const active = await this.prisma.eventOutboundWebhook.count({
      where: { eventId: event.id, organizationId: event.organizationId, enabled: true },
    });
    if (active >= WEBHOOK_LIMIT) throw new BadRequestException('Este evento já tem o máximo de 3 webhooks ativos.');
    const secret = issueEventApiKey().token.replace(/^evo_/u, 'whsec_');
    const created = await this.prisma.eventOutboundWebhook.create({
      data: { organizationId: event.organizationId, eventId: event.id, url, secret, createdByUserId: userId },
      select: { id: true, url: true, createdAt: true },
    });
    await this.audit(event, userId, 'integration.webhook_created', created.id, { host: new URL(url).host });
    return { id: created.id, url: created.url, secret, createdAt: created.createdAt.toISOString() };
  }

  async disableWebhook(userId: string, eventId: string, webhookId: string) {
    const event = await this.requireEvent(userId, eventId);
    const updated = await this.prisma.eventOutboundWebhook.updateMany({
      where: { id: webhookId, eventId: event.id, organizationId: event.organizationId, enabled: true },
      data: { enabled: false, disabledAt: new Date() },
    });
    if (updated.count !== 1) throw new NotFoundException('Webhook não encontrado.');
    await this.audit(event, userId, 'integration.webhook_disabled', webhookId, {});
    return { id: webhookId, enabled: false };
  }

  async listApiKeys(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    const items = await this.prisma.eventApiKey.findMany({
      where: { eventId: event.id, organizationId: event.organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, prefix: true, expiresAt: true, revokedAt: true, lastUsedAt: true, createdAt: true },
    });
    return {
      items: items.map((item) => ({
        ...item,
        expiresAt: item.expiresAt.toISOString(),
        revokedAt: item.revokedAt?.toISOString() ?? null,
        lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async createApiKey(userId: string, eventId: string, input: { label?: unknown }) {
    const event = await this.requireEvent(userId, eventId);
    const label = this.normalizeLabel(input?.label);
    const active = await this.prisma.eventApiKey.count({
      where: { eventId: event.id, organizationId: event.organizationId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active >= API_KEY_LIMIT) throw new BadRequestException('Este evento já tem o máximo de 3 chaves ativas.');
    const issued = issueEventApiKey();
    const expiresAt = new Date(Date.now() + API_KEY_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.prisma.eventApiKey.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        label,
        prefix: issued.prefix,
        keyHash: issued.keyHash,
        expiresAt,
        createdByUserId: userId,
      },
      select: { id: true, label: true, prefix: true, expiresAt: true },
    });
    await this.audit(event, userId, 'integration.api_key_issued', created.id, { prefix: created.prefix, expiresAt: created.expiresAt.toISOString() });
    return { ...created, expiresAt: created.expiresAt.toISOString(), token: issued.token };
  }

  async revokeApiKey(userId: string, eventId: string, keyId: string) {
    const event = await this.requireEvent(userId, eventId);
    const updated = await this.prisma.eventApiKey.updateMany({
      where: { id: keyId, eventId: event.id, organizationId: event.organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count !== 1) throw new NotFoundException('Chave não encontrada.');
    await this.audit(event, userId, 'integration.api_key_revoked', keyId, {});
    return { id: keyId, revoked: true };
  }

  async listPreparations(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    const items = await this.prisma.eventIntegrationPreparation.findMany({
      where: { eventId: event.id, organizationId: event.organizationId, withdrawnAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { code: true, accountLabel: true, createdAt: true, updatedAt: true },
    });
    return { items, outbound: false as const };
  }

  async openPreparation(userId: string, eventId: string, input: { code?: string; accountLabel?: string }) {
    const event = await this.requireEvent(userId, eventId);
    const code = this.preparationCode(input.code);
    let accountLabel: string;
    try { accountLabel = normalizePreparationAccountLabel(input.accountLabel); }
    catch (error) { this.policy(error); }
    const existing = await this.prisma.eventIntegrationPreparation.findFirst({
      where: { eventId: event.id, organizationId: event.organizationId, code },
      select: { id: true, accountLabel: true, withdrawnAt: true },
    });
    const reopened = Boolean(existing);
    const previousLabelKept = existing ? existing.accountLabel === accountLabel : false;
    await this.prisma.eventIntegrationPreparation.upsert({
      where: { eventId_code: { eventId: event.id, code } },
      create: {
        organizationId: event.organizationId,
        eventId: event.id,
        code,
        accountLabel,
        createdByUserId: userId,
      },
      update: { accountLabel, withdrawnAt: null, createdByUserId: userId },
    });
    await this.audit(event, userId, 'integration.preparation_opened', event.id, {
      code,
      reopened,
      labelChanged: reopened ? !previousLabelKept : false,
      wasWithdrawn: Boolean(existing?.withdrawnAt),
    });
    return { code, accountLabel, ...refuseProviderDelivery(), message: 'Preparação registrada. Nenhum dado é enviado ao provedor.' };
  }

  async withdrawPreparation(userId: string, eventId: string, rawCode: string) {
    const event = await this.requireEvent(userId, eventId);
    const code = this.preparationCode(rawCode);
    const current = await this.prisma.eventIntegrationPreparation.findFirst({
      where: { eventId: event.id, organizationId: event.organizationId, code, withdrawnAt: null },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Preparação não encontrada.');
    await this.prisma.eventIntegrationPreparation.update({
      where: { id: current.id },
      data: { withdrawnAt: new Date() },
    });
    await this.audit(event, userId, 'integration.preparation_withdrawn', event.id, { code });
    return { code, withdrawn: true, ...refuseProviderDelivery() };
  }

  async presence(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    const record = await this.prisma.event.findFirst({
      where: { id: event.id, organizationId: event.organizationId },
      select: { name: true, slug: true },
    });
    if (!record) throw new NotFoundException('Evento não encontrado.');
    const publicUrl = publicEventUrl(record.slug);
    return {
      publicUrl,
      snippet: publicUrl ? websitePresenceSnippet(record.name, publicUrl) : null,
      note: publicUrl
        ? 'Cole este trecho no site da organização. Ele não executa código e não incorpora a página.'
        : 'O endereço público ainda não está configurado neste ambiente.',
    };
  }

  async readPublicEvent(slug: string, authorization: string | undefined) {
    const token = /^Bearer\s+(evo_[A-Za-z0-9_-]{20,100})$/u.exec(authorization?.trim() ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Credencial inválida.');
    const key = await this.prisma.eventApiKey.findUnique({
      where: { keyHash: hashEventApiKey(token) },
      select: { id: true, eventId: true, organizationId: true, expiresAt: true, revokedAt: true, lastUsedAt: true },
    });
    const now = new Date();
    if (!key || key.revokedAt || key.expiresAt <= now) throw new UnauthorizedException('Credencial inválida.');
    const event = await this.prisma.event.findFirst({
      where: { id: key.eventId, organizationId: key.organizationId, slug: slug.trim().toLowerCase() },
      select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, format: true, venue: true },
    });
    if (!event) throw new UnauthorizedException('Credencial inválida.');
    const usageCutoff = new Date(now.getTime() - 15 * 60 * 1000);
    if (!key.lastUsedAt || key.lastUsedAt < usageCutoff) {
      await this.prisma.eventApiKey.updateMany({
        where: { id: key.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: usageCutoff } }] },
        data: { lastUsedAt: now },
      });
    }
    const confirmedRegistrations = await this.prisma.eventRegistrationReservation.count({
      where: { eventId: event.id, organizationId: key.organizationId, status: RegistrationReservationStatus.CONFIRMED },
    });
    const publicUrl = publicEventUrl(event.slug);
    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        status: event.status,
        format: event.format,
        startDate: event.startDate?.toISOString() ?? null,
        endDate: event.endDate?.toISOString() ?? null,
        venue: event.venue,
        publicUrl,
      },
      confirmedRegistrations,
    };
  }

  async notifyRegistrationConfirmed(notice: ConfirmedRegistrationNotice): Promise<void> {
    try {
      const hooks = await this.prisma.eventOutboundWebhook.findMany({
        where: { eventId: notice.eventId, organizationId: notice.organizationId, enabled: true },
        select: { id: true, url: true, secret: true },
        take: WEBHOOK_LIMIT,
      });
      const occurredAt = new Date().toISOString();
      const timestamp = Math.floor(Date.parse(occurredAt) / 1000);
      await Promise.allSettled(hooks.map(async (hook) => {
        const delivery = await this.prisma.eventOutboundWebhookDelivery.create({
          data: {
            webhookId: hook.id,
            organizationId: notice.organizationId,
            eventId: notice.eventId,
            reservationId: notice.reservationId,
            status: 'FAILED',
          },
          select: { id: true },
        }).catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
          throw error;
        });
        if (!delivery) return;
        const body = JSON.stringify(registrationConfirmedPayload(delivery.id, notice, occurredAt));
        try {
          const statusCode = await this.post(hook.url, body, {
            'content-type': 'application/json',
            'user-agent': 'Evolvia-Webhooks/1',
            'evolvia-timestamp': String(timestamp),
            'evolvia-signature': webhookSignatureHeader(hook.secret, timestamp, body),
            'evolvia-delivery': delivery.id,
          });
          await this.prisma.eventOutboundWebhookDelivery.update({
            where: { id: delivery.id },
            data: { status: statusCode >= 200 && statusCode < 300 ? 'DELIVERED' : 'FAILED', statusCode },
          });
        } catch {
          await this.prisma.eventOutboundWebhookDelivery.update({
            where: { id: delivery.id },
            data: { status: 'FAILED' },
          });
        }
      }));
    } catch {
      // Falha de webhook não impede a confirmação por e-mail nem desfaz a inscrição.
    }
    try {
      await this.confirmationMail?.sendConfirmed(notice);
    } catch {
      return;
    }
  }

  private async requireEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId };
  }

  private normalizeUrl(value: unknown): string {
    try { return normalizeWebhookUrl(value); }
    catch (error) { this.policy(error); }
  }

  private normalizeLabel(value: unknown): string {
    try { return normalizeApiKeyLabel(value); }
    catch (error) { this.policy(error); }
  }

  private policy(error: unknown): never {
    if (error instanceof IntegrationFoundationPolicyError) throw new BadRequestException(error.message);
    throw error;
  }

  private preparationCode(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-z0-9_]{2,40}$/u.test(value)) {
      throw new BadRequestException('Esta integração não aceita preparação.');
    }
    const item = INTEGRATION_CATALOG.find((entry) => entry.code === value);
    if (!item || item.foundation !== 'preparation') {
      throw new BadRequestException('Esta integração não aceita preparação.');
    }
    return item.code;
  }

  private async audit(
    event: { id: string; organizationId: string },
    actorUserId: string,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId,
        action,
        entityType: 'Event',
        entityId,
        metadata,
      },
    });
  }
}


