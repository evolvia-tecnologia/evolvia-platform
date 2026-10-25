import {
  applyRichTextAlign,
  parseRichTextAlign,
  wrapRichTextFmt,
  type RichTextAlign,
  type RichTextColor,
  type RichTextFont,
  type RichTextSize,
} from './public-rich-text-style.ts';

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
    const font: RichTextFont = mode.startsWith('font:') ? mode.slice(5) as RichTextFont : 'sans';
    const size: RichTextSize = mode.startsWith('size:') ? Number(mode.slice(5)) as RichTextSize : 16;
    const color: RichTextColor = mode.startsWith('color:') ? mode.slice(6) as RichTextColor : 'text';
    const preset = mode.startsWith('font:') ? { font, size: 16 as RichTextSize, color: 'text' as RichTextColor }
      : mode.startsWith('size:') ? { font: 'sans' as RichTextFont, size, color: 'text' as RichTextColor }
        : { font: 'sans' as RichTextFont, size: 16 as RichTextSize, color };
    return wrapRichTextFmt(value, start, end, preset.font, preset.size, preset.color);
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

