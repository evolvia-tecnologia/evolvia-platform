import type { ReactNode } from 'react';
import EvaScreenSupport from '../../components/eva-screen-support';

export default function HelpLayout({ children }: { children: ReactNode }) {
  return <>
    {children}
    <EvaScreenSupport guide="help" />
  </>;
}
