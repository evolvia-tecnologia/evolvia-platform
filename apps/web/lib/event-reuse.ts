export type EventReuseDraft = {
  name: string;
  confirmationName: string;
  startDate: string;
  endDate: string;
  timeZone: string;
};

export function eventReuseClientIssue(value: EventReuseDraft, now = new Date()): string | null {
  if (value.name.trim().length < 3) return 'Informe o nome do novo evento.';
  if (!value.confirmationName.trim()) return 'Confirme o nome do evento de origem.';
  const start = new Date(value.startDate);
  const end = new Date(value.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Informe datas e horários válidos.';
  if (start.getTime() <= now.getTime()) return 'A data de início deve estar no futuro.';
  if (end.getTime() < start.getTime()) return 'A data de término não pode ser anterior ao início.';
  if (!value.timeZone.trim()) return 'Informe o fuso horário do evento.';
  return null;
}

