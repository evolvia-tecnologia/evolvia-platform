/** Frase vigente da API. A tela não inventa outra regra de formato. */
const UNAVAILABLE = 'Transmissão disponível somente para eventos online ou híbridos';

export function transmissionUnavailable(message: string | null | undefined): boolean {
  return typeof message === 'string' && message.includes(UNAVAILABLE);
}

export function transmissionFieldFromApiMessage(message: string | null | undefined): 'title' | 'url' | null {
  if (typeof message !== 'string' || transmissionUnavailable(message)) return null;
  if (/título da transmissão/iu.test(message)) return 'title';
  if (/https|endereço público/iu.test(message)) return 'url';
  return null;
}
