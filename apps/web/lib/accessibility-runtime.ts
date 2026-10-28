const BLOCKS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION', 'DD']);
const CONTROLS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);

export type ClickProbe = {
  tagName?: string;
  parent?: ClickProbe | null;
  source?: Element;
  hasAttribute?: (name: string) => boolean;
  getAttribute?: (name: string) => string | null;
};

export type MediaProbe = {
  tagName?: string;
  pause?: () => void;
};

export function readableClickTarget(node: ClickProbe | null): ClickProbe | null {
  const nodes: ClickProbe[] = [];
  let current = node;
  while (current) {
    nodes.push(current);
    current = current.parent ?? null;
  }
  if (nodes.some((item) => item.getAttribute?.('data-a11y-speak') === 'off' || item.hasAttribute?.('data-a11y-chrome'))) return null;
  if (nodes.some((item) => CONTROLS.has((item.tagName ?? '').toUpperCase()))) return null;
  return nodes.find((item) => BLOCKS.has((item.tagName ?? '').toUpperCase())) ?? null;
}

export function elementToProbe(element: Element): ClickProbe & { source: Element } {
  return {
    tagName: element.tagName,
    source: element,
    hasAttribute: (name) => element.hasAttribute(name),
    getAttribute: (name) => element.getAttribute(name),
    parent: element.parentElement ? elementToProbe(element.parentElement) : null,
  };
}

export function pausePageMedia(nodes: readonly MediaProbe[]): number {
  let paused = 0;
  for (const node of nodes) {
    const tag = (node.tagName ?? '').toUpperCase();
    if ((tag === 'AUDIO' || tag === 'VIDEO') && node.pause) {
      node.pause();
      paused += 1;
    }
  }
  return paused;
}

export function isPageMediaEvent(target: MediaProbe | null): boolean {
  const tag = (target?.tagName ?? '').toUpperCase();
  return tag === 'AUDIO' || tag === 'VIDEO';
}

export function readingMaskBands(clientY: number, viewportHeight: number, band = 88): { topHeight: number; lowerTop: number } {
  const height = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const center = Math.min(height, Math.max(0, Number.isFinite(clientY) ? clientY : 0));
  const half = band / 2;
  return {
    topHeight: Math.max(0, center - half),
    lowerTop: Math.min(height, center + half),
  };
}
