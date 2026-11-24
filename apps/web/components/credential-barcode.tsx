'use client';

import { useMemo } from 'react';
import { code128Modules } from '../lib/code128';

export default function CredentialBarcode({ value }: { value: string }) {
  const modules = useMemo(() => code128Modules(value), [value]);
  const bars = useMemo(() => {
    const pieces: string[] = [];
    let x = 0;
    let bar = true;
    for (const width of modules) {
      const size = Number(width);
      if (bar) pieces.push(`M${x} 0h${size}v40h-${size}z`);
      x += size;
      bar = !bar;
    }
    return { path: pieces.join(''), width: x };
  }, [modules]);

  // xMidYMid meet preserva proporção das barras (zona de silêncio + módulo).
  // Esticar o Code128 (aspect ratio forçado) prejudicava a leitura física.
  return <svg role="img" aria-label="Código de barras da etiqueta" viewBox={`0 0 ${bars.width} 40`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', background: '#fff' }}>
    <path fill="#111" d={bars.path} />
  </svg>;
}
