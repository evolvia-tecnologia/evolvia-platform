import { parsePublicRichText, type PublicRichInline } from '../lib/public-rich-text';

function renderInlines(inlines: PublicRichInline[]) {
  return inlines.map((part, index) => {
    if (part.type === 'strong') return <strong key={index}>{part.value}</strong>;
    if (part.type === 'em') return <em key={index}>{part.value}</em>;
    if (part.type === 'link') {
      return <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.label}</a>;
    }
    return <span key={index}>{part.value}</span>;
  });
}

export default function PublicRichText({ text, className }: { text: string; className?: string }) {
  const blocks = parsePublicRichText(text);
  if (blocks.length === 0) return null;

  return <div className={className}>
    {blocks.map((block, index) => {
      if (block.type === 'heading') return <h3 key={index}>{renderInlines(block.inlines)}</h3>;
      if (block.type === 'list') {
        const Tag = block.ordered ? 'ol' : 'ul';
        return <Tag key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlines(item)}</li>)}</Tag>;
      }
      return <p key={index}>{block.lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{renderInlines(line)}</span>)}</p>;
    })}
  </div>;
}
