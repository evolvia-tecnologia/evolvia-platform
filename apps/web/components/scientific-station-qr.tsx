'use client';

import { useMemo } from 'react';
import { qrcodegen } from '../lib/vendor/qrcodegen';
import styles from './scientific-station.module.css';

export default function ScientificStationQr({ value, label }: { value: string; label: string }) {
  const symbol = useMemo(() => qrcodegen.QrCode.encodeText(value, qrcodegen.QrCode.Ecc.MEDIUM), [value]);
  const path = useMemo(() => {
    const cells: string[] = [];
    for (let y = 0; y < symbol.size; y += 1) {
      for (let x = 0; x < symbol.size; x += 1) {
        if (symbol.getModule(x, y)) cells.push(`M${x + 4} ${y + 4}h1v1h-1z`);
      }
    }
    return cells.join('');
  }, [symbol]);

  return <svg className={styles.qr} role="img" aria-label={label} viewBox={`0 0 ${symbol.size + 8} ${symbol.size + 8}`}>
    <path d={path} />
  </svg>;
}
