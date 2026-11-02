import type { Page } from '@playwright/test';
import { ambiente, entrar } from './ambiente';

export const eventos = {
  presencial: process.env.EVOLVIA_E2E_EVENTO_PRESENCIAL_ID ?? ambiente.eventoId,
  online: process.env.EVOLVIA_E2E_EVENTO_ONLINE_ID ?? '',
};

export const temEventoPresencial = Boolean(eventos.presencial);
export const temEventoOnline = Boolean(eventos.online);

/** Dados ficticios, estaveis por execucao, nunca PII real. */
export function ficticio(prefixo: string): string {
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/gu, '');
  return `${prefixo}-TESTE-${carimbo}`;
}

export const painel = {
  visaoGeral: (id: string) => `/eventos/${encodeURIComponent(id)}/painel`,
  categoriasLotes: (id: string) => `/eventos/${encodeURIComponent(id)}/painel/inscricoes/categorias-lotes`,
  ficha: (id: string) => `/eventos/${encodeURIComponent(id)}/painel/inscricoes/ficha`,
  beneficios: (id: string) => `/eventos/${encodeURIComponent(id)}/painel/inscricoes/beneficios`,
  financeiro: (id: string) => `/eventos/${encodeURIComponent(id)}/painel/financeiro`,
  transmissao: (id: string) => `/eventos/${encodeURIComponent(id)}/painel/transmissao`,
  credenciamento: (id: string) => `/eventos/${encodeURIComponent(id)}/painel/check-in`,
};

/** Entra e abre uma secao do painel, esperando a navegacao do evento. */
export async function abrirPainel(page: Page, caminho: string): Promise<void> {
  await entrar(page);
  await page.goto(caminho);
  await page.getByRole('navigation', { name: /navega(ç|c)(ã|a)o do evento/iu }).waitFor({ timeout: 30_000 });
}

/** Reabre em sessao limpa: prova persistencia no servidor, nao em cache local. */
export async function reabrirComNovaSessao(page: Page, caminho: string): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* bloqueado */ } });
  await abrirPainel(page, caminho);
}

/** PDF minimo valido, gerado em memoria: nenhum binario entra no repositorio. */
export function pdfFicticio(titulo: string): Buffer {
  const conteudo = `BT /F1 12 Tf 60 760 Td (${titulo}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const posicoes: number[] = [];
  objetos.forEach((corpo, indice) => {
    posicoes.push(pdf.length);
    pdf += `${indice + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const pos of posicoes) pdf += `${String(pos).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
