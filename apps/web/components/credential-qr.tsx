'use client';

import { useMemo } from 'react';
import { qrcodegen } from '../lib/vendor/qrcodegen';

export default function CredentialQr({ code }: { code: string }) {
  const symbol = useMemo(() => qrcodegen.QrCode.encodeText(code, qrcodegen.QrCode.Ecc.MEDIUM), [code]);
  const path = useMemo(() => {
    const cells: string[] = [];
    for (let y = 0; y < symbol.size; y++) {
      for (let x = 0; x < symbol.size; x++) {
        if (symbol.getModule(x, y)) cells.push(`M${x + 4} ${y + 4}h1v1h-1z`);
      }
    }
    return cells.join('');
  }, [symbol]);

  return <svg role="img" aria-label="QR de credenciamento" viewBox={`0 0 ${symbol.size + 8} ${symbol.size + 8}`}
    width="240" height="240" style={{ maxWidth: '100%', background: '#fff', padding: 8 }}>
    <path fill="#111" d={path} />
  </svg>;
}
