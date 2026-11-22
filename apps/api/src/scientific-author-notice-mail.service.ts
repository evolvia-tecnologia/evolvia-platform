import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventProfileCode, EventStatus, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { isDeliveryTimeout, readDeliveryConfig, readRegistrationEmail } from './registration-confirmation-mail.policy';
import { scientificMailEnabled, scientificNoticeStart, scientificNoticeKey, scientificNoticeMessage, scientificNoticeRecipients } from './scientific-author-notice-mail.policy';
import { claimScientificNoticeDispatch, completeScientificNoticeDispatch } from './scientific-notice-dispatch';

const ACCEPTED = 'scientific.author_email_provider_accepted';
const FAILED = 'scientific.author_email_provider_failed';
type Post = (url: string, body: string, headers: Record<string, string>) => Promise<number>;
type Scope = { organizationId: string; eventId: string; reservationId: string };

class NoticeRequestNotSent extends Error {}

async function postDelivery(url: string, body: string, headers: Record<string, string>): Promise<number> {
  let request: Request;
  try {
    request = new Request(url, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10_000), redirect: 'manual',
    });
  } catch {
    // A construção é local: o transporte ainda não recebeu a requisição.
    throw new NoticeRequestNotSent();
  }
  const response = await fetch(request);
  try { return response.status; }
  finally { await response.body?.cancel().catch(() => undefined); }
}

@Injectable()
export class ScientificAuthorNoticeMailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScientificAuthorNoticeMailService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private cursor: string | null = null;
  private scanExhausted = false;
  // Sweep older failed notices every 15 minutes only after reaching the end of a scan.
  private revisitAt = Date.now() + 15 * 60_000;

  constructor(private readonly prisma: PrismaService) {}

  // Somente código de erro Prisma permitido; mensagens podem conter dados pessoais,
  // endpoints ou credenciais e nunca devem ir para logs operacionais.
  private logWorkerFailure(error: unknown): void {
    const code = typeof error === 'object' && error !== null && 'code' in error &&
      typeof error.code === 'string' && /^P\d{4}$/.test(error.code) ? error.code : 'unknown';
    this.logger.warn(`scientific_notice_worker_failed code=${code}`);
  }

  onModuleInit() {
    const scope = this.enabledScope();
    if (!scope) return;
    // The persisted ScientificAuthorNotice record is the recovery source after a restart.
    this.timer = setInterval(() => {
      void this.dispatchPending().catch((error: unknown) => this.logWorkerFailure(error));
    }, 60_000);
    this.timer.unref();
    void this.dispatchPending().catch((error: unknown) => this.logWorkerFailure(error));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private enabledScope(): { organizationId: string; eventId: string } | null {
    const organizationId = process.env.EVOLVIA_SCIENTIFIC_NOTICE_ORGANIZATION_ID?.trim() ?? '';
    const eventId = process.env.EVOLVIA_SCIENTIFIC_NOTICE_EVENT_ID?.trim() ?? '';
    const scope = { organizationId, eventId };
    return scientificMailEnabled(process.env, scope) && readDeliveryConfig(process.env) ? scope : null;
  }

  // Bounded, resumable scan: accepted messages are deduplicated by recipient/version.
  // Independent API instances rely on the provider's stable Idempotency-Key for cross-instance dedupe.
  async dispatchPending(post: Post = postDelivery): Promise<number> {
    if (this.running) return 0;
    const scope = this.enabledScope();
    const start = scientificNoticeStart(process.env);
    if (!scope || !start) return 0;
    // New items are read after the cursor every minute; a bounded periodic rewind
    // recovers failed attempts and records inserted with an earlier timestamp.
    // Never rewind in the middle of a large backlog: that would starve
    // notices beyond the first 25 * 15 records on a busy event.
    if (this.scanExhausted && Date.now() >= this.revisitAt) {
      this.cursor = null;
      this.scanExhausted = false;
      this.revisitAt = Date.now() + 15 * 60_000;
    }
    this.running = true;
    try {
      let batch;
      try {
        batch = await this.prisma.scientificAuthorNotice.findMany({
          where: { organizationId: scope.organizationId, eventId: scope.eventId, recordedAt: { gte: start } },
          select: { id: true, organizationId: true, eventId: true, ownerReservationId: true, submissionId: true, versionNumber: true },
          orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }], take: 25,
          ...(this.cursor ? { cursor: { id: this.cursor }, skip: 1 } : {}),
        });
      } catch (error) {
        // Um aviso apagado entre ticks invalida o cursor Prisma (P2025).
        // Reiniciar a leitura não reenvia mensagens já aceitas: auditoria e
        // Idempotency-Key do provedor protegem o replay.
        if (this.cursor && typeof error === 'object' && error !== null &&
          'code' in error && error.code === 'P2025') {
          this.logger.warn('scientific_notice_cursor_missing_reset');
          this.cursor = null;
          this.scanExhausted = false;
          this.revisitAt = Date.now() + 15 * 60_000;
          return 0;
        }
        throw error;
      }
      if (batch.length === 0) {
        this.scanExhausted = true;
        return 0;
      }
      this.scanExhausted = batch.length < 25;
      let checked = 0;
      for (const item of batch) {
        this.cursor = item.id;
        try {
          await this.notify({
            organizationId: item.organizationId, eventId: item.eventId, reservationId: item.ownerReservationId,
          }, item.submissionId, item.versionNumber, post);
          checked += 1;
        } catch {
          // Keep the record durable for the next scan; do not leak submission or email details.
          this.logger.warn('scientific_notice_dispatch_retry_later');
        }
      }
      return checked;
    } finally { this.running = false; }
  }

  // Called only after successful transaction commit, never from a draft or idempotent replay.
  // Disabled by default even if the general registration mail gateway is configured.
  async notify(scope: Scope, submissionId: string, versionNumber: number, post: Post = postDelivery): Promise<void> {
    if (!scientificMailEnabled(process.env, scope)) return;
    const config = readDeliveryConfig(process.env);
    const notBefore = scientificNoticeStart(process.env);
    if (!config || !notBefore) return;
    if (!Number.isSafeInteger(versionNumber) || versionNumber < 1) return;
    const notice = await this.prisma.scientificAuthorNotice.findFirst({
      where: { organizationId: scope.organizationId, eventId: scope.eventId,
        submissionId, ownerReservationId: scope.reservationId, versionNumber,
        recordedAt: { gte: notBefore } },
      select: { kind: true },
    });
    if (!notice) return;
    const submission = await this.prisma.scientificSubmission.findFirst({
      where: { id: submissionId, organizationId: scope.organizationId, eventId: scope.eventId,
        ownerReservationId: scope.reservationId, currentVersion: versionNumber,
        event: { status: EventStatus.PUBLISHED, profileCode: EventProfileCode.SCIENTIFIC_EVENT } },
      select: {
        title: true, currentVersion: true,
        event: { select: { name: true, slug: true } },
        ownerReservation: { select: { registrationData: true, status: true } },
        authors: { select: { person: { select: { email: true } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!submission || submission.ownerReservation?.status !== RegistrationReservationStatus.CONFIRMED) return;
    const registration = submission.ownerReservation?.registrationData;
    const data = registration && typeof registration === 'object' && !Array.isArray(registration)
      ? registration as Record<string, unknown> : null;
    const submitterName = typeof data?.full_name === 'string' ? data.full_name : '';
    if (!submitterName.trim()) return;

    // Each recipient receives a separate message. Never expose other authors in "to".
    const recipients = scientificNoticeRecipients(submission.authors);
    // Batches of four avoid a burst against the delivery gateway and bound dispatch time.
    for (let offset = 0; offset < recipients.length; offset += 4) {
      const results = await Promise.allSettled(recipients.slice(offset, offset + 4).map(async (recipient) => {
      const recipientHash = scientificNoticeKey({ ...scope, submissionId, versionNumber, recipient });
      const where = {
        organizationId: scope.organizationId, eventId: scope.eventId,
        entityId: submissionId, action: ACCEPTED,
        AND: [
          { metadata: { path: ['recipientHash'], equals: recipientHash } },
          { metadata: { path: ['version'], equals: versionNumber } },
        ],
      } as Prisma.AuditLogWhereInput;
      if (await this.prisma.auditLog.findFirst({ where, select: { id: true } })) return;
      // O registro durável é a única autoridade para iniciar transporte.
      // Uma réplica concorrente que perder o claim não chama a rede.
      const acquired = await claimScientificNoticeDispatch(this.prisma, {
        idempotencyKey: recipientHash, organizationId: scope.organizationId,
        eventId: scope.eventId, submissionId, versionNumber,
      }, new Date(), () => this.logger.warn('scientific_notice_claim_expired_unknown_reconciliation_required'));
      if (!acquired) return;

      const message = scientificNoticeMessage({
        eventName: submission.event.name, title: submission.title, submitterName,
        kind: notice.kind, versionNumber, recipient, sender: config.sender,
        publicBaseUrl: config.publicBaseUrl, slug: submission.event.slug,
      });
      let reason: 'provider_accepted' | 'rejected' | 'not_sent' | 'timeout' | 'uncertain' = 'uncertain';
      let httpStatus: number | null = null;
      try {
        const status = await post(config.endpoint, JSON.stringify(message), {
          'Content-Type': 'application/json', Authorization: `Bearer ${config.token}`,
          'Idempotency-Key': recipientHash,
        });
        httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
        if (status >= 200 && status < 300) reason = 'provider_accepted';
        // Só rejeição explícita 4xx (exceto timeout/limite) permite retry controlado.
        else if (status >= 400 && status < 500 && status !== 408 && status !== 429) reason = 'rejected';
      } catch (error) {
        if (error instanceof NoticeRequestNotSent) reason = 'not_sent';
        else reason = isDeliveryTimeout(error) ? 'timeout' : 'uncertain';
      }
      // Primeiro grava o resultado durável. Se houver crash antes da auditoria,
      // ACCEPTED não será enviado de novo. Se a gravação falhar após 2xx,
      // PROCESSING expirará em UNKNOWN, sem reenvio cego.
      await completeScientificNoticeDispatch(
        this.prisma, recipientHash,
        reason === 'provider_accepted' ? 'ACCEPTED' : (reason === 'rejected' || reason === 'not_sent') ? 'FAILED' : 'UNKNOWN',
      );
      await this.prisma.auditLog.create({
        data: {
          organizationId: scope.organizationId, eventId: scope.eventId,
          action: reason === 'provider_accepted' ? ACCEPTED : FAILED,
          entityType: 'ScientificSubmission', entityId: submissionId,
          metadata: {
            version: versionNumber, kind: notice.kind, recipientHash,
            providerAccepted: reason === 'provider_accepted',
            delivered: false, received: false, reason,
            // Never persist raw gateway errors: they may include credentials or personal data.
            ...(httpStatus === null ? {} : { httpStatus }),
          } as Prisma.InputJsonObject,
        },
      });
      }));
      // Falha em auditoria de um destinatário não interrompe os demais.
      // O outbox persistido será revisitado; não registrar e-mail nem erro bruto.
      if (results.some((result) => result.status === 'rejected')) {
        this.logger.warn('scientific_notice_recipient_retry_later');
      }
    }
  }
}