import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'Evolvia', description:'Criação inteligente e self-service de eventos.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="pt-BR"><body>{children}</body></html>; }
