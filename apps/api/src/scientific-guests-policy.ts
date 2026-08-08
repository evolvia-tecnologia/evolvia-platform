import {
  ScientificInvitationStatus,
  ScientificParticipationType,
} from '@prisma/client';
import { createHash } from 'node:crypto';

export const participationTypeLabels: Record<ScientificParticipationType, string> = {
  SPEAKER: 'Palestrante',
  GUEST: 'Convidado',
  MODERATOR: 'Moderador',
  DEBATER: 'Debatedor',
  SESSION_CHAIR: 'Coordenador de sessão',
  OTHER: 'Outra função',
};

export function invitationTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function invitationCanBePrepared(status: ScientificInvitationStatus): boolean {
  return status === ScientificInvitationStatus.DRAFT
    || status === ScientificInvitationStatus.PREPARED
    || status === ScientificInvitationStatus.SENT
    || status === ScientificInvitationStatus.VIEWED
    || status === ScientificInvitationStatus.DECLINED;
}

export function invitationCanBeMarkedSent(status: ScientificInvitationStatus): boolean {
  return status === ScientificInvitationStatus.PREPARED;
}

export function invitationCanReceiveResponse(status: ScientificInvitationStatus): boolean {
  return status === ScientificInvitationStatus.PREPARED
    || status === ScientificInvitationStatus.SENT
    || status === ScientificInvitationStatus.VIEWED;
}

export function renderScientificInvitationTemplate(
  template: string,
  values: { name: string; event: string; role: string },
): string {
  return template
    .replaceAll('{NOME}', values.name)
    .replaceAll('{EVENTO}', values.event)
    .replaceAll('{FUNCAO}', values.role);
}
