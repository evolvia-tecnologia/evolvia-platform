import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EventProfileCode, Prisma, ScientificSubmissionStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { ScientificFileStorage } from './scientific-file.storage';
import {
  SCIENTIFIC_FILE_BATCH_BYTES,
  SCIENTIFIC_FILE_BATCH_MAX,
  batchIndexCsv,
  belongsToEvent,
  storedZip,
  submissionBatchName,
} from './scientific-file-batch.policy';

const READY = [
  ScientificSubmissionStatus.SUBMITTED,
  ScientificSubmissionStatus.UNDER_REVIEW,
  ScientificSubmissionStatus.ACCEPTED,
  ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES,
];

@Injectable()
export class ScientificFileBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly files: ScientificFileStorage,
  ) {}

  async download(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const selected: Array<{ name: string; bytes: Buffer; title: string }> = [];
    let cursor: string | undefined;
    let bytes = 0;
    let skipped = 0;
    let truncated = false;
    for (let page = 0; page < 5 && selected.length < SCIENTIFIC_FILE_BATCH_MAX; page += 1) {
      const rows = await this.prisma.scientificSubmission.findMany({
        where: {
          eventId: event.id,
          organizationId: event.organizationId,
          status: { in: READY },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: SCIENTIFIC_FILE_BATCH_MAX + 1,
        select: {
          id: true,
          title: true,
          currentVersion: true,
          versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { versionNumber: true, fileKey: true } },
        },
      });
      const hasAnother = rows.length > SCIENTIFIC_FILE_BATCH_MAX;
      const slice = hasAnother ? rows.slice(0, SCIENTIFIC_FILE_BATCH_MAX) : rows;
      let stop = false;
      for (const row of slice) {
        if (selected.length >= SCIENTIFIC_FILE_BATCH_MAX) {
          truncated = true;
          stop = true;
          break;
        }
        const version = row.versions[0];
        if (!version || version.versionNumber !== row.currentVersion || !version.fileKey) { skipped += 1; continue; }
        if (!belongsToEvent(version.fileKey, event.organizationId, event.id)) { skipped += 1; continue; }
        let file: Buffer;
        try {
          file = await this.files.read(version.fileKey);
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
          skipped += 1;
          continue;
        }
        if (bytes + file.length > SCIENTIFIC_FILE_BATCH_BYTES) {
          truncated = true;
          stop = true;
          break;
        }
        bytes += file.length;
        selected.push({ name: submissionBatchName(selected.length + 1, version.versionNumber), bytes: file, title: row.title });
      }
      if (stop) break;
      if (!hasAnother) break;
      if (selected.length >= SCIENTIFIC_FILE_BATCH_MAX) {
        truncated = true;
        break;
      }
      cursor = slice[slice.length - 1]?.id;
      if (!cursor) break;
      if (page === 4) truncated = true;
    }
    if (selected.length === 0) throw new NotFoundException('Nenhum PDF de trabalho disponível neste recorte.');
    const index = Buffer.from(batchIndexCsv(selected.map((item) => ({ fileName: item.name, title: item.title }))), 'utf8');
    const zip = storedZip([{ name: 'indice.csv', bytes: index }, ...selected.map((item) => ({ name: item.name, bytes: item.bytes }))]);
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId: userId,
        action: 'scientific.files_batch_downloaded',
        entityType: 'Event',
        entityId: event.id,
        metadata: {
          fileCount: selected.length,
          skipped,
          truncated,
          byteCount: zip.length,
        } as Prisma.InputJsonObject,
      },
    });
    return { bytes: zip, fileCount: selected.length, truncated };
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, profileCode: true, status: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('O pacote de arquivos está disponível apenas para eventos técnico-científicos.');
    }
    if (event.status === 'CANCELLED') throw new ConflictException('O pacote de arquivos não pode ser gerado em um evento cancelado.');
    return { id: event.id, organizationId: event.organizationId };
  }
}
