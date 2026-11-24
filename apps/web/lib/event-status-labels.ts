export const EVENT_STATUS_LABELS = {
  DRAFT: 'Rascunho',
  SETUP: 'Em configuração',
  HOMOLOGATION: 'Em homologação',
  READY_TO_PUBLISH: 'Pronto para publicar',
  PUBLISHED: 'Publicado',
  SUSPENDED: 'Suspenso',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
} as const;

export type EventStatusCode = keyof typeof EVENT_STATUS_LABELS;

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status as EventStatusCode] ?? status;
}
