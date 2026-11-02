import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { writeFileSync } from 'node:fs';
import { ehGateObrigatorio } from './gates';

type Linha = {
  titulo: string;
  projeto: string;
  estado: 'PASS' | 'FAIL' | 'SKIP';
  gateObrigatorio: boolean;
  motivo: string;
  duracaoMs: number;
};

/**
 * Relator legivel com PASS/FAIL/SKIP explicito (issue #628, item 7).
 * Regra dura: gate obrigatorio em SKIP encerra a execucao com falha.
 * Mensagens de erro passam por um filtro de PII antes de ir ao relatorio.
 */
export default class RelatorioJornadas implements Reporter {
  private readonly linhas: Linha[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const estado = result.status === 'passed' ? 'PASS'
      : result.status === 'skipped' ? 'SKIP' : 'FAIL';
    this.linhas.push({
      titulo: test.title,
      projeto: test.parent.project()?.name ?? '-',
      estado,
      gateObrigatorio: ehGateObrigatorio(test.title),
      motivo: semPii(result.error?.message ?? (estado === 'SKIP' ? motivoDoSkip(result) : '')),
      duracaoMs: result.duration,
    });
  }

  onEnd(resultado: FullResult): void | { status: FullResult['status'] } {
    const puladosObrigatorios = this.linhas.filter((l) => l.gateObrigatorio && l.estado === 'SKIP');
    const falhas = this.linhas.filter((l) => l.estado === 'FAIL');

    const largura = Math.max(40, ...this.linhas.map((l) => l.titulo.length));
    const texto = [
      '',
      '='.repeat(largura + 32),
      'JORNADAS REAIS DO ORGANIZADOR — issue #628',
      '='.repeat(largura + 32),
      ...this.linhas.map((l) => `${l.estado.padEnd(4)} ${l.gateObrigatorio ? '[GATE]' : '      '} ${l.titulo.padEnd(largura)} ${l.projeto}${l.motivo ? `\n       motivo: ${l.motivo}` : ''}`),
      '',
      `Total ${this.linhas.length} | PASS ${this.linhas.filter((l) => l.estado === 'PASS').length}`
        + ` | FAIL ${falhas.length} | SKIP ${this.linhas.filter((l) => l.estado === 'SKIP').length}`,
    ];

    if (puladosObrigatorios.length) {
      texto.push(
        '',
        'EXECUCAO INVALIDA: gate obrigatorio terminou em SKIP.',
        'Um gate so conta como aprovado quando executa de verdade.',
        ...puladosObrigatorios.map((l) => `  - ${l.titulo} (${l.projeto}) — ${l.motivo || 'sem motivo registrado'}`),
      );
    }

    const saida = texto.join('\n');
    console.log(saida);
    writeFileSync('relatorio-jornadas.txt', `${saida}\n`, 'utf8');
    writeFileSync('relatorio-jornadas.json', JSON.stringify({
      gatesObrigatoriosPulados: puladosObrigatorios.length,
      linhas: this.linhas,
    }, null, 2), 'utf8');

    if (puladosObrigatorios.length) return { status: 'failed' };
    return { status: resultado.status };
  }
}

function motivoDoSkip(result: TestResult): string {
  const anotacao = result.annotations?.find((a) => a.type === 'skip');
  return anotacao?.description ?? 'fixture ou credencial ausente';
}

/** Nenhum e-mail, CPF ou token sai no relatorio (issue #628, item 7). */
export function semPii(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w.-]+\.\w+/gu, '<email>')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/gu, '<documento>')
    .replace(/\b[A-Fa-f0-9]{32,}\b/gu, '<token>')
    .replace(/(Bearer\s+)\S+/giu, '$1<token>')
    .slice(0, 800);
}
