import {
  applyRichTextAlign,
  parseRichTextAlign,
  wrapRichTextFmt,
  type RichTextAlign,
  type RichTextColor,
  type RichTextFont,
  type RichTextSize,
} from './publication-text-style';

export type FormatMode =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'list'
  | 'link'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | `font:${RichTextFont}`
  | `size:${RichTextSize}`
  | `color:${RichTextColor}`;

export function applyFormat(value: string, start: number, end: number, mode: FormatMode): { next: string; from: number; to: number } | null {
  if (mode === 'alignLeft' || mode === 'alignCenter' || mode === 'alignRight') {
    const align: RichTextAlign = mode === 'alignLeft' ? 'left' : mode === 'alignCenter' ? 'center' : 'right';
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineBreak = value.indexOf('\n', Math.max(end, start));
    const lineEnd = lineBreak === -1 ? value.length : lineBreak;
    const line = value.slice(lineStart, lineEnd);
    const nextLine = applyRichTextAlign(line, align);
    const { content } = parseRichTextAlign(nextLine);
    const prefixLength = nextLine.length - content.length;
    return {
      next: value.slice(0, lineStart) + nextLine + value.slice(lineEnd),
      from: lineStart + prefixLength,
      to: lineStart + prefixLength + content.length,
    };
  }

  if (mode.startsWith('font:') || mode.startsWith('size:') || mode.startsWith('color:')) {
    const spans = /\[\[fmt (sans|serif) (12|14|16|18|20|24) ([a-z-]+)\]\]([\s\S]*?)\[\[\/fmt\]\]/gu;
    for (const span of value.matchAll(spans)) {
      const contentStart = span.index! + span[0].indexOf(']]') + 2;
      const contentEnd = contentStart + span[4].length;
      const spanEnd = span.index! + span[0].length;
      const wholeSpan = start === span.index && end === spanEnd;
      if (!wholeSpan && !(start >= contentStart && end <= contentEnd)) continue;
      const font = (mode.startsWith('font:') ? mode.slice(5) : span[1]) as RichTextFont;
      const size = (mode.startsWith('size:') ? Number(mode.slice(5)) : Number(span[2])) as RichTextSize;
      const color = (mode.startsWith('color:') ? mode.slice(6) : span[3]) as RichTextColor;
      const selectedStart = wholeSpan ? contentStart : start;
      const selectedEnd = wholeSpan ? contentEnd : end;
      const before = value.slice(contentStart, selectedStart);
      const after = value.slice(selectedEnd, contentEnd);
      const oldOpen = span[0].slice(0, contentStart - span.index!);
      const prefix = before ? `${oldOpen}${before}[[/fmt]]` : '';
      const suffix = after ? `${oldOpen}${after}[[/fmt]]` : '';
      const result = wrapRichTextFmt(value.slice(selectedStart, selectedEnd), 0, selectedEnd - selectedStart, font, size, color);
      const offset = span.index! + prefix.length;
      return {
        next: value.slice(0, span.index) + prefix + result.next + suffix + value.slice(spanEnd),
        from: offset + result.from,
        to: offset + result.to,
      };
    }
    // Crossing existing delimiters must never create invalid nested spans.
    if (/\[\[(?:fmt\b|\/fmt\]\])/.test(value.slice(start, end))) return null;
    const font = (mode.startsWith('font:') ? mode.slice(5) : 'sans') as RichTextFont;
    const size = (mode.startsWith('size:') ? Number(mode.slice(5)) : 16) as RichTextSize;
    const color = (mode.startsWith('color:') ? mode.slice(6) : 'text') as RichTextColor;
    return wrapRichTextFmt(value, start, end, font, size, color);
  }

  if (mode === 'bold' || mode === 'italic') {
    const marker = mode === 'bold' ? '**' : '*';
    const selected = value.slice(start, end) || 'texto';
    const wrapped = `${marker}${selected}${marker}`;
    return {
      next: value.slice(0, start) + wrapped + value.slice(end),
      from: start + marker.length,
      to: start + marker.length + selected.length,
    };
  }

  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineBreak = value.indexOf('\n', Math.max(end, start));
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  const block = value.slice(lineStart, lineEnd);

  if (mode === 'heading') {
    const heading = /^(#{1,3}) /u.exec(block);
    const nextLine = heading ? block : `## ${block || 'Título'}`;
    const prefixLength = heading ? heading[1].length + 1 : 3;
    return {
      next: value.slice(0, lineStart) + nextLine + value.slice(lineEnd),
      from: lineStart + prefixLength,
      to: lineStart + nextLine.length,
    };
  }

  if (mode === 'list') {
    const nextBlock = (block || 'item').split('\n').map((line) => (/^[-*] /u.test(line) ? line : `- ${line || 'item'}`)).join('\n');
    return {
      next: value.slice(0, lineStart) + nextBlock + value.slice(lineEnd),
      from: lineStart,
      to: lineStart + nextBlock.length,
    };
  }

  const label = value.slice(start, end) || 'texto do link';
  const wrapped = `[${label}](https://)`;
  const hrefStart = start + label.length + 3;
  return {
    next: value.slice(0, start) + wrapped + value.slice(end),
    from: hrefStart,
    to: hrefStart + 'https://'.length,
  };
}



