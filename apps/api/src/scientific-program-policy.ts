import { ScientificInvitationStatus, ScientificParticipationType } from '@prisma/client';

export type ScientificProgramConflictSeverity = 'BLOCKING' | 'WARNING';

export type ScientificProgramConflictCode =
  | 'INVALID_INTERVAL'
  | 'OUTSIDE_EVENT_DATES'
  | 'SPACE_OVERLAP'
  | 'PERSON_OVERLAP'
  | 'CUSTOM_ROLE_REQUIRED'
  | 'INVITATION_DECLINED'
  | 'INVITATION_CANCELLED'
  | 'INVITATION_PENDING';

export type ScientificProgramConflict = {
  code: ScientificProgramConflictCode;
  severity: ScientificProgramConflictSeverity;
  message: string;
  suggestion: string;
  entityIds?: string[];
};

export function programIntervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

export function validateProgramActivityWindow(input: {
  startAt: Date;
  endAt: Date;
  eventStart?: Date | null;
  eventEnd?: Date | null;
}): ScientificProgramConflict[] {
  const conflicts: ScientificProgramConflict[] = [];

  if (input.endAt.getTime() <= input.startAt.getTime()) {
    conflicts.push({
      code: 'INVALID_INTERVAL',
      severity: 'BLOCKING',
      message: 'O horário final precisa ser posterior ao horário inicial.',
      suggestion: 'Revise o início e o fim da atividade antes de continuar.',
    });
    return conflicts;
  }

  if (
    (input.eventStart && input.startAt.getTime() < input.eventStart.getTime())
    || (input.eventEnd && input.endAt.getTime() > input.eventEnd.getTime())
  ) {
    conflicts.push({
      code: 'OUTSIDE_EVENT_DATES',
      severity: 'BLOCKING',
      message: 'A atividade está fora do período configurado para o evento.',
      suggestion: 'Escolha data e horário dentro do início e término do evento.',
    });
  }

  return conflicts;
}

export function validateProgramParticipationRole(
  participationType: ScientificParticipationType,
  customRoleLabel?: string | null,
): ScientificProgramConflict[] {
  if (participationType !== ScientificParticipationType.OTHER || customRoleLabel?.trim()) return [];

  return [{
    code: 'CUSTOM_ROLE_REQUIRED',
    severity: 'BLOCKING',
    message: 'Informe o nome da função quando selecionar “Outra função”.',
    suggestion: 'Exemplo: Facilitadora, Relator ou Coordenador convidado.',
  }];
}

export function invitationStatusWarning(
  status?: ScientificInvitationStatus | null,
): ScientificProgramConflict | null {
  if (status === ScientificInvitationStatus.DECLINED) {
    return {
      code: 'INVITATION_DECLINED',
      severity: 'WARNING',
      message: 'A pessoa recusou o convite registrado no módulo de palestrantes e convidados.',
      suggestion: 'Confirme a participação antes de considerar esta atividade pronta.',
    };
  }

  if (status === ScientificInvitationStatus.CANCELLED) {
    return {
      code: 'INVITATION_CANCELLED',
      severity: 'WARNING',
      message: 'O convite desta pessoa está cancelado.',
      suggestion: 'Revise o participante ou prepare um novo convite quando apropriado.',
    };
  }

  if (
    status
    && status !== ScientificInvitationStatus.CONFIRMED
  ) {
    return {
      code: 'INVITATION_PENDING',
      severity: 'WARNING',
      message: 'A participação ainda não está confirmada no módulo de palestrantes e convidados.',
      suggestion: 'A programação pode continuar, mas acompanhe a confirmação antes do evento.',
    };
  }

  return null;
}
