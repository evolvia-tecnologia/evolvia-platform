import { eventTimeZoneLabel } from './event-flow';
import { formatEventDate } from './event-time-zone';

export function eventDateImpactNote(profileCode?: string | null, eventType?: string | null): string {
  if (eventType === 'Corrida') return 'Alterar estas datas não muda modalidades, inscrições, kits nem camisetas.';
  if (profileCode === 'ENTERTAINMENT') return 'Alterar estas datas não muda períodos de ingressos, categorias nem lotes.';
  if (profileCode === 'SCIENTIFIC_EVENT') return 'Alterar estas datas não muda janelas de submissão, avaliação nem a programação.';
  if (profileCode === 'FAIR_EXHIBITION') return 'Alterar estas datas não muda prazos de expositores, CAEX nem credenciais.';
  if (profileCode === 'CORPORATE_TRAINING') return 'Alterar estas datas não muda inscrições, o local nem o credenciamento.';
  return 'Alterar estas datas não muda inscrições, lotes, pagamentos nem confirmações.';
}

export function eventScheduleSummary(input: {
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
  datesPending?: boolean;
  venue?: string | null;
  venuePending?: boolean;
}): { start: string; end: string; timeZone: string; venue: string } {
  const zone = input.timeZone?.trim() ? eventTimeZoneLabel(input.timeZone) : 'Fuso não confirmado';
  const venue = input.venuePending
    ? 'A definir'
    : input.venue?.trim()
      ? input.venue.trim()
      : 'Local não definido';
  if (input.datesPending) return { start: 'A definir', end: 'A definir', timeZone: zone, venue };
  const formatted = (value: string | null | undefined, empty: string) => formatEventDate(value ?? null, input.timeZone ?? null, { dateStyle: 'long', timeStyle: 'short' }) ?? empty;
  return {
    start: formatted(input.startDate, 'Data de início não definida'),
    end: formatted(input.endDate, 'Data de término não definida'),
    timeZone: zone,
    venue,
  };
}
