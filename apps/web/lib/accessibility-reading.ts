const SKIPPED_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS',
  'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IFRAME', 'OBJECT', 'AUDIO', 'VIDEO',
]);

const CHUNK_SIZE = 320;
const CHUNK_LIMIT = 40;

export type ReadingSource = {
  nodeType: number;
  nodeValue?: string | null;
  tagName?: string;
  childNodes?: Iterable<ReadingSource>;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
};

export type SpeechEngine = {
  cancel: () => void;
  speak: (text: string, lang: string, onEnd?: () => void, onError?: (reason: string) => void) => void;
};

let readingGeneration = 0;
const activeUtterances = new Set<SpeechSynthesisUtterance>();

export function heldUtteranceCount(): number {
  return activeUtterances.size;
}

export function shouldSkipReading(node: ReadingSource): boolean {
  if (node.nodeType !== 1) return false;
  const tag = (node.tagName ?? '').toUpperCase();
  if (SKIPPED_TAGS.has(tag)) return true;
  if (node.getAttribute?.('aria-hidden') === 'true') return true;
  if (node.hasAttribute?.('hidden')) return true;
  if (node.getAttribute?.('data-a11y-speak') === 'off') return true;
  if (node.hasAttribute?.('data-a11y-chrome')) return true;
  return false;
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/gu, ' ').trim();
}

function collect(node: ReadingSource, parts: string[]): void {
  if (node.nodeType === 3) {
    const value = normalized(node.nodeValue);
    if (value) parts.push(value);
    return;
  }
  if (node.nodeType !== 1 || shouldSkipReading(node)) return;
  if ((node.tagName ?? '').toUpperCase() === 'IMG') {
    const alt = normalized(node.getAttribute?.('alt'));
    if (alt) parts.push(alt);
    return;
  }
  for (const child of node.childNodes ?? []) collect(child, parts);
}

export function collectReadableText(root: ReadingSource | null): string {
  if (!root) return '';
  const parts: string[] = [];
  collect(root, parts);
  return parts.join(' ').replace(/\s+/gu, ' ').trim();
}

export function readingChunks(text: string, size = CHUNK_SIZE, limit = CHUNK_LIMIT): string[] {
  const normalizedText = normalized(text);
  if (!normalizedText) return [];
  const chunks: string[] = [];
  let rest = normalizedText;
  while (rest && chunks.length < limit) {
    if (rest.length <= size) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(' ', size);
    if (cut < Math.floor(size / 2)) cut = size;
    const piece = rest.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    rest = rest.slice(cut).trim();
  }
  return chunks;
}

export function browserSpeechEngine(): SpeechEngine | null {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return null;
  const synthesis = window.speechSynthesis;
  return {
    cancel: () => {
      synthesis.cancel();
      activeUtterances.clear();
    },
    speak: (text, lang, onEnd, onError) => {
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      activeUtterances.add(utterance);
      utterance.onend = () => {
        activeUtterances.delete(utterance);
        onEnd?.();
      };
      utterance.onerror = (event) => {
        activeUtterances.delete(utterance);
        onError?.(event.error);
      };
      synthesis.speak(utterance);
    },
  };
}

function speakChunks(engine: SpeechEngine, chunks: string[], generation: number, onDone?: () => void, onError?: (reason: string) => void): void {
  for (let index = 0; index < chunks.length; index += 1) {
    if (generation !== readingGeneration) return;
    engine.speak(chunks[index], 'pt-BR', () => {
      if (index === chunks.length - 1 && generation === readingGeneration) onDone?.();
    }, (reason) => {
      if (generation !== readingGeneration) return;
      readingGeneration += 1;
      engine.cancel();
      onError?.(reason);
    });
  }
}

export function startLocalReading(engine: SpeechEngine, text: string, onDone?: () => void, onError?: (reason: string) => void): 'started' | 'empty' {
  const generation = ++readingGeneration;
  engine.cancel();
  const chunks = readingChunks(text);
  if (chunks.length === 0) return 'empty';
  // O Chrome descarta speak() no mesmo instante de cancel(). A fala entra na fila no turno seguinte.
  setTimeout(() => speakChunks(engine, chunks, generation, onDone, onError), 50);
  return 'started';
}

export function stopLocalReading(engine: SpeechEngine): void {
  readingGeneration += 1;
  engine.cancel();
}
