export type AgendaActivity = {
  id: string; title: string; activityType: string; startAt: string; endAt: string;
  status: 'DRAFT' | 'READY_FOR_REVIEW'; spaceId: string | null;
  space: { name: string } | null;
  participants: Array<{ id: string; participationType: string; customRoleLabel: string | null; person: { name: string; institution: string | null } }>;
};
export function agendaTimeZone(value?: string | null): string {
  try { if (value) { new Intl.DateTimeFormat('pt-BR', { timeZone: value }); return value; } } catch { /* Legacy timezone is unconfirmed. */ }
  return 'UTC';
}
export function agendaDay(value: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'undated';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: agendaTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
}
export function agendaDateLabel(value: string, timeZone: string): string {
  if (!Number.isFinite(new Date(value).getTime())) return 'Data não definida';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: agendaTimeZone(timeZone), weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(value));
}
export function agendaHour(value: string, timeZone: string): string {
  if (!Number.isFinite(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: agendaTimeZone(timeZone), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
export function agendaRole(role: string, custom: string | null): string {
  return ({ SPEAKER: 'Palestrante', MODERATOR: 'Moderação', DEBATER: 'Debate', SESSION_CHAIR: 'Coordenação da sessão', GUEST: 'Convidado', OTHER: custom || 'Outra função' } as Record<string, string>)[role] ?? 'Participação';
}
const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
export function agendaGroups(activities: AgendaActivity[], timeZone: string, filters: { day: string; space: string; query: string }) {
  const query = searchable(filters.query.trim());
  const filtered = activities.filter((activity) =>
    (filters.day === 'all' || agendaDay(activity.startAt, timeZone) === filters.day) &&
    (filters.space === 'all' || (filters.space === 'unassigned' ? !activity.spaceId : activity.spaceId === filters.space)) &&
    (!query || searchable([activity.title, activity.activityType, activity.space?.name ?? '', ...activity.participants.map((person) => `${person.person?.name ?? ''} ${person.person?.institution ?? ''}`)].join(' ')).includes(query)),
  ).sort((a, b) => (Date.parse(a.startAt) || 0) - (Date.parse(b.startAt) || 0) || a.title.localeCompare(b.title, 'pt-BR') || a.id.localeCompare(b.id));
  const groups = new Map<string, { day: string; label: string; activities: AgendaActivity[] }>();
  for (const activity of filtered) {
    const day = agendaDay(activity.startAt, timeZone);
    if (!groups.has(day)) groups.set(day, { day, label: agendaDateLabel(activity.startAt, timeZone), activities: [] });
    groups.get(day)!.activities.push(activity);
  }
  return [...groups.values()];
}
