export type EventReuseDraft = {
  name: string;
  confirmationName: string;
  startDate: string;
  endDate: string;
  timeZone: string;
};

function formatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

function wallTime(date: Date, format: Intl.DateTimeFormat): string {
  const parts = Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function eventReuseLocalValue(value: string | null | undefined, timeZone: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return wallTime(date, formatter(timeZone)).slice(0, 16);
}

/** Resolve an event's wall clock without consulting the browser timezone. */
export function eventReuseInstant(value: string, timeZone: string): string {
  let format: Intl.DateTimeFormat;
  try { format = formatter(timeZone); }
  catch { throw new Error('Informe um fuso horário válido do evento.'); }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Informe datas e horários válidos.');
  const wall = `${value}:00`;
  const nominal = Date.parse(`${wall}Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 19) !== wall) {
    throw new Error('Informe datas e horários válidos.');
  }
  // Sample both sides of timezone transitions to discover all applicable offsets.
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = nominal + hours * 3_600_000;
    offsets.add(Date.parse(`${wallTime(new Date(sample), format)}Z`) - sample);
  }
  const candidates = [...offsets].map((offset) => nominal - offset)
    .filter((instant) => wallTime(new Date(instant), format) === wall);
  if (candidates.length === 0) throw new Error('Este horário não existe no fuso do evento devido à mudança de horário. Escolha outro horário.');
  if (candidates.length > 1) throw new Error('Este horário é ambíguo no fuso do evento devido à mudança de horário. Escolha outro horário.');
  return new Date(candidates[0]).toISOString();
}

export function eventReuseClientIssue(value: EventReuseDraft, now = new Date()): string | null {
  if (value.name.trim().length < 3) return 'Informe o nome do novo evento.';
  if (!value.confirmationName.trim()) return 'Confirme o nome do evento de origem.';
  let start: Date;
  let end: Date;
  try {
    start = new Date(eventReuseInstant(value.startDate, value.timeZone));
    end = new Date(eventReuseInstant(value.endDate, value.timeZone));
  } catch (reason) { return reason instanceof Error ? reason.message : 'Informe datas e horários válidos.'; }
  if (start.getTime() <= now.getTime()) return 'A data de início deve estar no futuro.';
  if (end.getTime() < start.getTime()) return 'A data de término não pode ser anterior ao início.';
  return null;
}

