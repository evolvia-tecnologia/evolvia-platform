export type PublicRichInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'em'; value: string }
  | { type: 'link'; label: string; href: string };

export type PublicRichBlock =
  | { type: 'heading'; inlines: PublicRichInline[] }
  | { type: 'paragraph'; lines: PublicRichInline[][] }
  | { type: 'list'; ordered: boolean; items: PublicRichInline[][] };

const INLINE = /\[([^\]\n]{1,180})\]\((https:\/\/[^)\s]{1,500})\)|\*\*([^*\n]{1,400})\*\*|\*([^*\n]{1,400})\*/gu;

function safeHttps(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parsePublicRichInlines(input: string): PublicRichInline[] {
  const result: PublicRichInline[] = [];
  let last = 0;
  for (const match of input.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) result.push({ type: 'text', value: input.slice(last, index) });
    if (match[1] && match[2]) {
      const href = safeHttps(match[2]);
      if (href) result.push({ type: 'link', label: match[1], href });
      else result.push({ type: 'text', value: match[0] });
    } else if (match[3]) {
      result.push({ type: 'strong', value: match[3] });
    } else if (match[4]) {
      result.push({ type: 'em', value: match[4] });
    }
    last = index + match[0].length;
  }
  if (last < input.length) result.push({ type: 'text', value: input.slice(last) });
  return result.filter((part) => part.type !== 'text' || part.value.length > 0);
}

function isBullet(line: string): boolean {
  return /^[-*] /u.test(line.trim());
}

function isOrdered(line: string): boolean {
  return /^\d{1,3}\. /u.test(line.trim());
}

function parseChunk(chunk: string): PublicRichBlock[] {
  const lines = chunk.split('\n');
  const blocks: PublicRichBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const content = paragraph.filter((line) => line.trim().length > 0);
    paragraph = [];
    if (content.length === 0) return;
    blocks.push({ type: 'paragraph', lines: content.map((line) => parsePublicRichInlines(line)) });
  };

  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/u.exec(trimmed);
    if (heading?.[2]?.trim()) {
      flushParagraph();
      blocks.push({ type: 'heading', inlines: parsePublicRichInlines(heading[2].trim()) });
      index += 1;
      continue;
    }
    if (isBullet(trimmed)) {
      flushParagraph();
      const items: PublicRichInline[][] = [];
      while (index < lines.length && isBullet(lines[index].trim())) {
        items.push(parsePublicRichInlines(lines[index].trim().replace(/^[-*] /u, '')));
        index += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }
    if (isOrdered(trimmed)) {
      flushParagraph();
      const items: PublicRichInline[][] = [];
      while (index < lines.length && isOrdered(lines[index].trim())) {
        items.push(parsePublicRichInlines(lines[index].trim().replace(/^\d{1,3}\. /u, '')));
        index += 1;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }
    paragraph.push(lines[index]);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

export function parsePublicRichText(source: string): PublicRichBlock[] {
  return source
    .replace(/\u0000/gu, '')
    .replace(/\r\n/gu, '\n')
    .split(/\n{2,}/u)
    .flatMap((chunk) => parseChunk(chunk));
}
