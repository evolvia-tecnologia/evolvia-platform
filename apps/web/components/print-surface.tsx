'use client';

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './print-surface.module.css';

/** Keep the printable document outside the panel, wizard and fixed overlays. */
export default function PrintSurface({ children, widthMm, heightMm }: {
  children: ReactNode;
  widthMm?: number;
  heightMm?: number;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.body); }, []);
  const label = widthMm !== undefined || heightMm !== undefined;
  const width = Number.isInteger(widthMm) && widthMm! >= 30 && widthMm! <= 120 ? widthMm : 90;
  const height = Number.isInteger(heightMm) && heightMm! >= 15 && heightMm! <= 80 ? heightMm : 40;
  // @page é global: instale somente enquanto esta superfície estiver montada.
  // useLayoutEffect disponibiliza o tamanho físico antes do primeiro paint/print.
  useLayoutEffect(() => {
    if (!target) return;
    const style = document.createElement('style');
    style.setAttribute('data-evolvia-print-page', 'true');
    style.textContent = `@page { size: ${label ? `${width}mm ${height}mm` : 'A4'}; margin: ${label ? '0' : '12mm'}; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [target, label, width, height]);
  if (!target) return null;
  return createPortal(<div data-evolvia-print-root className={styles.root}>
    {children}
  </div>, target);
}
