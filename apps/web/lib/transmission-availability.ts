/** Frase vigente da API. A tela não inventa outra regra de formato. */
const UNAVAILABLE = 'Transmissão disponível somente para eventos online ou híbridos';

export function transmissionUnavailable(message: string): boolean {
  return message.includes(UNAVAILABLE);
}

export function transmissionFieldFromApiMessage(message: string): 'title' | 'url' | null {
  if (transmissionUnavailable(message)) return null;
  if (/título da transmissão/iu.test(message)) return 'title';
  if (/https|endereço público/iu.test(message)) return 'url';
  return null;
}
