import { parsePublicRichText, type PublicRichInline } from './public-rich-text';
import {
  normalizePublicationRichText,
  RICH_TEXT_COLOR_CSS,
  type RichTextAlign,
  type RichTextColor,
  type RichTextFont,
  type RichTextSize,
} from './publication-text-style';

const SIZES: readonly RichTextSize[] = [12, 14, 16, 18, 20, 24];
const COLORS: readonly RichTextColor[] = [
  'navy', 'navy-soft', 'blue', 'blue-soft', 'text', 'muted', 'success', 'warning', 'danger',
];

export const RICH_TEXT_EDITOR_FONTS: Record<RichTextFont, string> = {
  sans: 'system-ui, sans-serif',
  serif: 'Georgia, Times New Roman, Times, serif',
};

export const RICH_TEXT_EDITOR_COLORS: Record<RichTextColor, string> = {
  navy: '#111a2f',
  'navy-soft': '#22365e',
  blue: '#0b64e5',
  'blue-soft': '#0748a4',
  text: '#10233d',
  muted: '#52647b',
  success: '#147449',
  warning: '#875600',
  danger: '#a52b2b',
};

type Style = { font: RichTextFont; size: RichTextSize; color: RichTextColor };
type Marks = { bold: boolean; italic: boolean };
type Node = { tag: string; attrs: Record<string, string>; children: Array<Node | string> };

const DEFAULT_STYLE: Style = { font: 'sans', size: 16, color: 'text' };

function safeHttps(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function inlineToHtml(inlines: PublicRichInline[]): string {
  return inlines.map((part) => {
    if (part.type === 'text') return escapeHtml(part.value);
    if (part.type === 'strong') return `<strong>${escapeHtml(part.value)}</strong>`;
    if (part.type === 'em') return `<em>${escapeHtml(part.value)}</em>`;
    if (part.type === 'link') return `<a href="${escapeHtml(part.href)}">${escapeHtml(part.label)}</a>`;
    const css = [
      `font-family:${RICH_TEXT_EDITOR_FONTS[part.font]}`,
      `font-size:${part.size}px`,
      `color:${RICH_TEXT_EDITOR_COLORS[part.color]}`,
    ].join(';');
    return `<span style="${css}">${inlineToHtml(part.inlines)}</span>`;
  }).join('');
}

export function markupToHtml(markup: string): string {
  const blocks = parsePublicRichText(markup);
  if (blocks.length === 0) return '<p></p>';
  return blocks.map((block) => {
    if (block.type === 'heading') return `<h2>${inlineToHtml(block.inlines)}</h2>`;
    if (block.type === 'list') {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join('')}</${tag}>`;
    }
    const body = block.lines.map((line) => inlineToHtml(line)).join('<br>');
    const align = block.align === 'left' ? '' : ` style="text-align:${block.align};"`;
    return `<p${align}>${body}</p>`;
  }).join('');
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

function parseFragment(html: string): Array<Node | string> {
  const root: Node = { tag: 'root', attrs: {}, children: [] };
  const stack: Node[] = [root];
  const token = /<!--[\s\S]*?-->|<\/([a-z0-9]+)\s*>|<([a-z0-9]+)([^>]*?)(\/)?>|([^<]+)/giu;
  for (const match of html.matchAll(token)) {
    if (match[1]) {
      const name = match[1].toLowerCase();
      let target = -1;
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === name) {
          target = index;
          break;
        }
      }
      if (target > 0) stack.splice(target);
      continue;
    }
    if (match[2]) {
      const node: Node = { tag: match[2].toLowerCase(), attrs: parseAttrs(match[3] ?? ''), children: [] };
      stack[stack.length - 1].children.push(node);
      const empty = Boolean(match[4]) || node.tag === 'br';
      if (!empty) stack.push(node);
      continue;
    }
    if (match[5]) stack[stack.length - 1].children.push(match[5]);
  }
  return root.children;
}

function fromCodePoint(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return '';
  return String.fromCodePoint(value);
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&#(\d+);/gu, (_, code: string) => fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) => fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/giu, '"')
    .replace(/&lt;/giu, '')
    .replace(/&gt;/giu, '')
    .replace(/&amp;/giu, '&')
    .replace(/[<>]/gu, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '');
}

function nearestSize(raw: string): RichTextSize | null {
  const size = Number(raw);
  if (!Number.isFinite(size)) return null;
  return SIZES.reduce((best, candidate) => Math.abs(candidate - size) < Math.abs(best - size) ? candidate : best);
}

function colorFromCss(raw: string): RichTextColor | null {
  const value = raw.trim().toLowerCase();
  const named = (Object.entries(RICH_TEXT_EDITOR_COLORS) as Array<[RichTextColor, string]>)
    .find(([, hex]) => hex === value);
  if (named) return named[0];
  const variable = (Object.entries(RICH_TEXT_COLOR_CSS) as Array<[RichTextColor, string]>)
    .find(([, css]) => css.toLowerCase() === value);
  return variable?.[0] ?? null;
}

function styleFromCss(style: string, current: Style): Style {
  const next = { ...current };
  for (const piece of style.split(';')) {
    const [name, ...rest] = piece.split(':');
    const key = name?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (!key || !value) continue;
    if (key === 'font-family') {
      next.font = /sans-serif|system-ui/iu.test(value) ? 'sans' : /georgia|times|serif/iu.test(value) ? 'serif' : 'sans';
    }
    if (key === 'font-size') {
      const size = nearestSize(value.replace(/px$/iu, ''));
      if (size) next.size = size;
    }
    if (key === 'color') {
      const color = colorFromCss(value);
      if (color) next.color = color;
    }
  }
  return next;
}

function alignFromStyle(style: string | undefined): RichTextAlign {
  const match = /text-align\s*:\s*(left|center|right)/iu.exec(style ?? '');
  return (match?.[1].toLowerCase() as RichTextAlign | undefined) ?? 'left';
}

function sameStyle(style: Style): boolean {
  return style.font === DEFAULT_STYLE.font && style.size === DEFAULT_STYLE.size && style.color === DEFAULT_STYLE.color;
}

function paint(text: string, style: Style, marks: Marks): string {
  if (!text) return '';
  let value = text;
  if (marks.italic && !marks.bold) value = `*${value}*`;
  if (marks.bold) value = `**${value}**`;
  if (!sameStyle(style)) value = `[[fmt ${style.font} ${style.size} ${style.color}]]${value}[[/fmt]]`;
  return value;
}

function inlineNodes(nodes: Array<Node | string>, style: Style, marks: Marks): string {
  let result = '';
  for (const node of nodes) {
    if (typeof node === 'string') {
      result += paint(decode(node), style, marks);
      continue;
    }
    if (node.tag === 'br') {
      result += '\n';
      continue;
    }
    if (node.tag === 'strong' || node.tag === 'b') {
      result += inlineNodes(node.children, style, { ...marks, bold: true });
      continue;
    }
    if (node.tag === 'em' || node.tag === 'i') {
      result += inlineNodes(node.children, style, { ...marks, italic: true });
      continue;
    }
    if (node.tag === 'span') {
      result += inlineNodes(node.children, styleFromCss(node.attrs.style ?? '', style), marks);
      continue;
    }
    if (node.tag === 'a') {
      const label = inlineNodes(node.children, style, { bold: false, italic: false }).replace(/[\[\]]/gu, '');
      const href = safeHttps(node.attrs.href ?? '');
      result += label && href ? `[${label}](${href})` : label;
      continue;
    }
    if (node.tag === 'script' || node.tag === 'style') continue;
    result += inlineNodes(node.children, style, marks);
  }
  return result;
}

function linesOf(nodes: Array<Node | string>, style: Style): string[] {
  return inlineNodes(nodes, style, { bold: false, italic: false })
    .split('\n')
    .map((line) => line.trimEnd());
}

function withAlign(lines: string[], align: RichTextAlign): string {
  return lines
    .filter((line, index, all) => line.length > 0 || (index > 0 && index < all.length - 1))
    .map((line) => align === 'left' || line.length === 0 ? line : `@${align} ${line}`)
    .join('\n');
}

function blocksFrom(nodes: Array<Node | string>): string[] {
  const blocks: string[] = [];
  for (const node of nodes) {
    if (typeof node === 'string') {
      const text = decode(node).trim();
      if (text) blocks.push(text);
      continue;
    }
    if (node.tag === 'h2' || node.tag === 'h3' || node.tag === 'h4') {
      const text = linesOf(node.children, DEFAULT_STYLE).join(' ').trim();
      if (text) blocks.push(`## ${text}`);
      continue;
    }
    if (node.tag === 'ul' || node.tag === 'ol') {
      const items = node.children.filter((child): child is Node => typeof child !== 'string' && child.tag === 'li');
      const lines = items.map((item, index) => {
        const text = linesOf(item.children, DEFAULT_STYLE).join(' ').trim() || 'item';
        return node.tag === 'ol' ? `${index + 1}. ${text}` : `- ${text}`;
      });
      if (lines.length) blocks.push(lines.join('\n'));
      continue;
    }
    if (node.tag === 'p' || node.tag === 'div') {
      const text = withAlign(linesOf(node.children, DEFAULT_STYLE), alignFromStyle(node.attrs.style));
      if (text.trim()) blocks.push(text);
      continue;
    }
    if (node.tag === 'script' || node.tag === 'style') continue;
    blocks.push(...blocksFrom(node.children));
  }
  return blocks;
}

export function htmlToMarkup(html: string): string | null {
  const markup = blocksFrom(parseFragment(html)).join('\n\n').trim();
  try {
    return normalizePublicationRichText(markup);
  } catch {
    return null;
  }
}

