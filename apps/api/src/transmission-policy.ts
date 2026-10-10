export const TRANSMISSION_KINDS = ['VIDEOCONFERENCE', 'LIVE', 'RECORDED'] as const;
export type TransmissionKind = (typeof TRANSMISSION_KINDS)[number];

export type TransmissionLink = {
  kind: TransmissionKind;
  title: string;
  url: string;
};

export class TransmissionPolicyError extends Error {}

const KIND_LABEL: Record<TransmissionKind, string> = {
  VIDEOCONFERENCE: 'Videoconferência',
  LIVE: 'Vídeo ao vivo',
  RECORDED: 'Vídeo gravado',
};

export function transmissionKindLabel(kind: TransmissionKind): string {
  return KIND_LABEL[kind];
}

export function readTransmission(config: unknown): TransmissionLink | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const raw = config as Record<string, unknown>;
  if (!TRANSMISSION_KINDS.includes(raw.kind as TransmissionKind)) return null;
  if (typeof raw.title !== 'string' || typeof raw.url !== 'string') return null;
  try {
    return {
      kind: raw.kind as TransmissionKind,
      title: plainTitle(raw.title),
      url: httpsLink(raw.url),
    };
  } catch {
    return null;
  }
}

export const ACTIVITY_TRANSMISSION_MAX = 40;

export type StoredActivityLink = TransmissionLink & { activityId: string };

export function activityDisplayTitle(value: string): string {
  const text = value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (text.length < 2 || text.length > 180 || /[<>]/u.test(text)) return 'Atividade sem título exibível';
  return text;
}

export function readActivityLinks(config: unknown): StoredActivityLink[] {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
  const links = (config as { links?: unknown }).links;
  if (!Array.isArray(links)) return [];
  const parsed: StoredActivityLink[] = [];
  for (const item of links) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.activityId !== 'string' || !/^[a-z0-9]{20,32}$/u.test(raw.activityId)) continue;
    const link = readTransmission({ kind: raw.kind, title: raw.title, url: raw.url });
    if (!link) continue;
    parsed.push({ activityId: raw.activityId, ...link });
    if (parsed.length === ACTIVITY_TRANSMISSION_MAX) break;
  }
  return parsed;
}

export function replaceActivityLink(current: StoredActivityLink[], activityId: string, link: TransmissionLink | null): StoredActivityLink[] {
  if (!/^[a-z0-9]{20,32}$/u.test(activityId)) throw new TransmissionPolicyError('Atividade inválida.');
  const rest = current.filter((item) => item.activityId !== activityId);
  if (!link) return rest;
  if (rest.length >= ACTIVITY_TRANSMISSION_MAX) throw new TransmissionPolicyError('O evento aceita até 40 links de atividade.');
  return [...rest, { activityId, kind: link.kind, title: link.title, url: link.url }];
}

export function normalizeTransmission(input: unknown): TransmissionLink | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TransmissionPolicyError('Transmissão inválida.');
  }
  const raw = input as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length === 1 && keys[0] === 'enabled' && raw.enabled === false) return null;
  const allowed = new Set(['kind', 'title', 'url']);
  if (keys.length !== 3 || keys.some((key) => !allowed.has(key))) {
    throw new TransmissionPolicyError('Transmissão inválida.');
  }
  if (!TRANSMISSION_KINDS.includes(raw.kind as TransmissionKind)) {
    throw new TransmissionPolicyError('Escolha videoconferência, vídeo ao vivo ou vídeo gravado.');
  }
  return {
    kind: raw.kind as TransmissionKind,
    title: plainTitle(raw.title),
    url: httpsLink(raw.url),
  };
}

function plainTitle(value: unknown): string {
  if (typeof value !== 'string') throw new TransmissionPolicyError('Informe o título da transmissão.');
  const title = value.trim().replace(/\s+/gu, ' ');
  if (title.length < 2 || title.length > 80) throw new TransmissionPolicyError('O título da transmissão precisa ter de 2 a 80 caracteres.');
  if (/[<>\u0000]/u.test(title)) throw new TransmissionPolicyError('O título da transmissão não pode conter marcação.');
  return title;
}

function httpsLink(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new TransmissionPolicyError('Informe um link https de até 500 caracteres.');
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new TransmissionPolicyError('Informe um link https.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TransmissionPolicyError('O link da transmissão precisa ser https, sem usuário e senha.');
  }
  const host = url.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/u.test(host) || !host.includes('.') || host.startsWith('.') || host.endsWith('.') || host.includes('..')) {
    throw new TransmissionPolicyError('Informe o endereço público da transmissão.');
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new TransmissionPolicyError('Informe o endereço público da transmissão.');
  }
  return url.toString();
}
