export type FormatMode = 'heading' | 'bold' | 'italic' | 'list' | 'link';

export function applyFormat(value: string, start: number, end: number, mode: FormatMode): { next: string; from: number; to: number } | null {
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

