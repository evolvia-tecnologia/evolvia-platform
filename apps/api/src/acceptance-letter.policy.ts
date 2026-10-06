const SITUATION = {
  ACCEPTED: 'Aceito',
  ACCEPTED_WITH_CHANGES: 'Aceito com alterações',
} as const;

export type AcceptanceLetterStatus = keyof typeof SITUATION;

const issuedAtLabel = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export function acceptanceLetterDocument(input: {
  eventName: string;
  title: string;
  modality: string;
  version: number;
  status: AcceptanceLetterStatus;
  authors: string[];
  issuedAt: Date;
}): { headline: string; text: string } {
  const headline = input.status === 'ACCEPTED' ? 'Carta de aceite' : 'Carta de aceite com alterações';
  const decision = input.status === 'ACCEPTED'
    ? 'A comissão registrou o aceite desta versão.'
    : 'A comissão registrou o aceite desta versão e pediu alterações. Siga a orientação publicada pelo evento.';
  const authors = input.authors.map((name) => name.trim()).filter(Boolean).join(', ') || 'Autor da inscrição';
  const text = [
    'EVOLVIA — CARTA DE ACEITE',
    'Confirma a decisão registrada neste evento. Não é certificado e não substitui a credencial.',
    '',
    `Evento: ${input.eventName}`,
    `Trabalho: ${input.title}`,
    `Modalidade: ${input.modality}`,
    `Versão: ${input.version}`,
    `Situação: ${SITUATION[input.status]}`,
    `Autores: ${authors}`,
    '',
    decision,
    'Pareceres, notas e nomes de avaliadores não entram nesta carta.',
    `Documento gerado em ${issuedAtLabel.format(input.issuedAt)} (UTC).`,
  ].join('\n');
  return { headline, text };
}
