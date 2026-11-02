import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult,
} from '@playwright/test/reporter';
import { ehGateObrigatorio } from './gates';

/**
 * Relator da frente de qualidade. Faz tres coisas que o relator padrao nao faz:
 *
 * 1. Separa SKIP por motivo. "Fixture ausente" e "capacidade ainda nao
 *    implantada" sao bloqueios declarados, nao aprovacoes; aparecem contados e
 *    nomeados em vez de somarem silenciosamente ao verde.
 * 2. Converte SKIP de gate obrigatorio em falha. Ver gates.ts.
 * 3. Remove PII do relatorio. Nenhum e-mail, CPF ou token sai em evidencia.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/gu;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/gu;
const TOKEN = /\b(?:eyJ[\w-]{8,}|EVQ1\.[\w-]+\.[0-9a-f]{16,})/gu;

export function semPii(texto: string): string {
  return texto
    .replace(EMAIL, '[email-removido]')
    .replace(CPF, '[cpf-removido]')
    .replace(TOKEN, '[token-removido]');
}

type Linha = { titulo: string; projeto: string; motivo: string };

export default class RelatorioEvolvia implements Reporter {
  private passou = 0;
  private falhou: Linha[] = [];
  private pulou: Linha[] = [];
  private gatesPulados: Linha[] = [];
  private instavel = 0;
  private inicio = 0;
  private planejados = 0;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.inicio = Date.now();
    this.planejados = suite.allTests().length;
    process.stdout.write(`\n[Evolvia QA] ${this.planejados} casos planejados.\n`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const projeto = test.parent.project()?.name ?? '-';
    const titulo = semPii(test.titlePath().slice(1).join(' › '));

    if (result.status === 'passed' && result.retry === 0) { this.passou += 1; return; }
    if (result.status === 'passed') { this.passou += 1; this.instavel += 1; return; }

    if (result.status === 'skipped') {
      const motivo = semPii(
        result.annotations?.find((a) => a.type === 'skip')?.description
        ?? test.annotations.find((a) => a.type === 'skip')?.description
        ?? 'motivo nao declarado',
      );
      const linha = { titulo, projeto, motivo };
      const gate = ehGateObrigatorio(test.titlePath().join(' '));
      if (gate) this.gatesPulados.push({ ...linha, motivo: `${gate}: ${motivo}` });
      else this.pulou.push(linha);
      return;
    }

    this.falhou.push({
      titulo,
      projeto,
      motivo: semPii(result.error?.message?.split('\n')[0] ?? result.status),
    });
  }

  onEnd(result: FullResult): { status: FullResult['status'] } {
    const seg = ((Date.now() - this.inicio) / 1000).toFixed(1);
    const l = (t: string) => process.stdout.write(`${t}\n`);

    l('\n──────────────────────────────────────────');
    l('[Evolvia QA] Resultado da execucao');
    l('──────────────────────────────────────────');
    l(`  PASS  ${this.passou}${this.instavel ? `  (${this.instavel} apos nova tentativa)` : ''}`);
    l(`  FAIL  ${this.falhou.length}`);
    l(`  SKIP  ${this.pulou.length} declarados  +  ${this.gatesPulados.length} em gate obrigatorio`);
    l(`  tempo ${seg}s`);

    if (this.falhou.length) {
      l('\n  Falhas:');
      for (const f of this.falhou) l(`    ✘ [${f.projeto}] ${f.titulo}\n        ${f.motivo}`);
    }
    if (this.pulou.length) {
      l('\n  Pulados com motivo declarado (NAO sao aprovacao):');
      for (const s of this.pulou) l(`    – [${s.projeto}] ${s.titulo}\n        ${s.motivo}`);
    }
    if (this.gatesPulados.length) {
      l('\n  GATE OBRIGATORIO PULADO — tratado como falha:');
      for (const g of this.gatesPulados) l(`    ✘ [${g.projeto}] ${g.titulo}\n        ${g.motivo}`);
      l('\n  Um gate obrigatorio sem execucao nao e evidencia de conformidade.');
      l('  Forneca a fixture ou retire a etiqueta de gate, com justificativa na issue #571.');
    }

    // Suite vazia nao e suite verde. Erro de compilacao, filtro errado ou
    // testDir errado chegam aqui como "0 casos" e precisam reprovar.
    // `--list` nao executa nada por definicao, logo esta isento.
    const apenasListando = process.argv.includes('--list');
    const vazia = !apenasListando && (this.planejados === 0
      || this.passou + this.falhou.length + this.pulou.length + this.gatesPulados.length === 0);
    if (vazia) {
      l('\n  NENHUM CASO EXECUTADO — tratado como falha.');
      l('  Zero teste nao e evidencia de conformidade. Causas usuais:');
      l('    - erro de compilacao num spec ou em support/ (veja a saida acima)');
      l('    - --grep ou --project sem correspondencia');
      l('    - testDir apontando para pasta errada');
    } else if (!this.falhou.length && !this.gatesPulados.length) {
      l(`\n  Nenhuma falha. Cobertura efetiva: ${this.passou} casos executados.`);
      if (this.pulou.length) l('  Atencao: ha casos pulados; o verde nao cobre o que nao rodou.');
    }
    l('──────────────────────────────────────────\n');

    if (vazia || this.gatesPulados.length) return { status: 'failed' };
    return { status: result.status };
  }
}
