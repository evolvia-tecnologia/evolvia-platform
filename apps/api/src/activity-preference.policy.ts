export function preferenceParticipantName(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Inscrição sem nome';
  const record = data as Record<string, unknown>;
  const raw = record.full_name ?? record.nome;
  if (typeof raw !== 'string') return 'Inscrição sem nome';
  const name = raw.trim().replace(/\s+/gu, ' ').slice(0, 80);
  if (!name || name.includes('@')) return 'Inscrição sem nome';
  return name;
}
