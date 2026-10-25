import {
  parseRichTextAlign,
  type RichTextAlign,
  type RichTextColor,
  type RichTextFont,
  type RichTextSize,
} from './publication-text-style';

export type PublicRichInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'em'; value: string }
  | { type: 'link'; label: string; href: string }
  | {
    type: 'styled';
    font: RichTextFont;
    size: RichTextSize;
    color: RichTextColor;
    inlines: PublicRichInline[];
  };

export type PublicRichBlock =
  | { type: 'heading'; inlines: PublicRichInline[] }
  | { type: 'paragraph'; align: RichTextAlign; lines: PublicRichInline[][] }
  | { type: 'list'; ordered: boolean; items: PublicRichInline[][] };

const FMT_OPEN = /^\[\[fmt (sans|serif) (12|14|16|18|20|24) (navy|navy-soft|blue|blue-soft|text|muted|success|warning|danger)\]\]/u;
const FMT_CLOSE = '[[/fmt]]';

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

function parseStyledSegment(input: string, start: number): { inline: PublicRichInline; next: number } | null {
  const header = FMT_OPEN.exec(input.slice(start));
  if (!header) return null;
  const openLength = header[0].length;
  const contentStart = start + openLength;
  const closeAt = input.indexOf(FMT_CLOSE, contentStart);
  if (closeAt < 0) return null;
  const inner = input.slice(contentStart, closeAt);
  return {
    inline: {
      type: 'styled',
      font: header[1] as RichTextFont,
      size: Number(header[2]) as RichTextSize,
      color: header[3] as RichTextColor,
      inlines: parsePublicRichInlines(inner),
    },
    next: closeAt + FMT_CLOSE.length,
  };
}

export function parsePublicRichInlines(input: string): PublicRichInline[] {
  const result: PublicRichInline[] = [];
  let index = 0;
  while (index < input.length) {
    const styled = parseStyledSegment(input, index);
    if (styled) {
      result.push(styled.inline);
      index = styled.next;
      continue;
    }
    const slice = input.slice(index);
    INLINE.lastIndex = 0;
    const match = INLINE.exec(slice);
    const nextStyle = slice.indexOf('[[fmt ');
    if (nextStyle > 0 && (!match || nextStyle <= match.index)) {
      result.push({ type: 'text', value: slice.slice(0, nextStyle) });
      index += nextStyle;
      continue;
    }
    if (!match || match.index == null) {
      result.push({ type: 'text', value: input.slice(index) });
      break;
    }
    const absolute = index + match.index;
    if (absolute > index) result.push({ type: 'text', value: input.slice(index, absolute) });
    if (match[1] && match[2]) {
      const href = safeHttps(match[2]);
      if (href) result.push({ type: 'link', label: match[1], href });
      else result.push({ type: 'text', value: match[0] });
    } else if (match[3]) {
      result.push({ type: 'strong', value: match[3] });
    } else if (match[4]) {
      result.push({ type: 'em', value: match[4] });
    }
    index = absolute + match[0].length;
    INLINE.lastIndex = 0;
  }
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

  let paragraphAlign: RichTextAlign = 'left';

  const flushParagraph = () => {
    const content = paragraph.filter((line) => line.trim().length > 0);
    paragraph = [];
    if (content.length === 0) {
      paragraphAlign = 'left';
      return;
    }
    blocks.push({
      type: 'paragraph',
      align: paragraphAlign,
      lines: content.map((line) => {
        const parsed = parseRichTextAlign(line);
        return parsePublicRichInlines(parsed.content);
      }),
    });
    paragraphAlign = 'left';
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
    if (paragraph.length === 0) {
      paragraphAlign = parseRichTextAlign(lines[index]).align;
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
    // The editor can persist a single span across several lines. Close and
    // reopen it before block parsing so each line keeps the original style.
    .replace(
      /(\[\[fmt (?:sans|serif) (?:12|14|16|18|20|24) (?:navy|navy-soft|blue|blue-soft|text|muted|success|warning|danger)\]\])([\s\S]*?)\[\[\/fmt\]\]/gu,
      (_span, open: string, content: string) => content.split('\n')
        .map((line) => {
          if (!line) return '';
          // Block markers must remain outside inline styling for the parser.
          const prefix = /^(?:@(?:left|center|right) )?(?:#{1,3} |[-*] |\d{1,3}\. )?/u.exec(line)![0];
          return `${prefix}${open}${line.slice(prefix.length)}[[/fmt]]`;
        })
        .join('\n'),
    )
    .split(/\n{2,}/u)
    .flatMap((chunk) => parseChunk(chunk));
}


