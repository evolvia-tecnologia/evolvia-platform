import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Verificacoes WCAG 2.2 AA implementadas aqui, sem axe-core.
 *
 * Motivo de existirem: o ambiente de escrita desta suite nao alcanca o registro
 * npm, portanto `@axe-core/playwright` pode nao estar instalado. Em vez de o
 * gate de acessibilidade simplesmente desaparecer, estas verificacoes rodam
 * sempre e sao deterministicas. Elas NAO substituem o axe: cobrem seis
 * criterios, nao as ~90 regras do axe. Quando o axe esta disponivel, os dois
 * rodam e os resultados sao independentes.
 *
 * Criterios cobertos:
 *   1.4.3  contraste de texto (4,5:1; 3:1 em texto grande)
 *   1.4.10 reflow (sem rolagem horizontal)
 *   1.4.11 contraste de componentes (borda de controle, 3:1)
 *   1.3.1  ordem de cabecalhos sem salto
 *   2.5.8  alvo de toque (24x24 CSS px)
 *   4.1.2  controle sem nome acessivel
 *
 * Correcao de 03/11/2026 -- cobertura de cor e o que NAO foi avaliado
 * ------------------------------------------------------------------
 * A revisao independente na #571 apontou "cobertura rgba". Estava certa, e o
 * problema era maior do que o nome sugere.
 *
 * `lerCor` so casava `rgb()/rgba()`. Mas getComputedStyle NAO normaliza tudo
 * para rgb -- medido no Chromium real:
 *
 *   color:oklch(0.7 0.1 250)                      -> oklch(0.7 0.1 250)
 *   color:color-mix(in srgb,#fff 12%,transparent) -> color(srgb 1 1 1 / 0.12)
 *   color:lab(50% 40 59.5)                        -> lab(50 40 59.5)
 *   color:hsl(210 50% 40%)                        -> rgb(51, 102, 153)
 *
 * Nos tres primeiros o regex falhava, lerCor devolvia null e o elemento era
 * descartado com `continue`, SEM entrar na contagem. Verde falso por omissao: o
 * criterio nao olhava aquele texto, e nada dizia isso.
 *
 * Nao e hipotetico. O globals.css do projeto usa
 * `color-mix(in srgb,var(--color-on-dark) 12%,transparent)`, que computa
 * exatamente para `color(srgb ...)`.
 *
 * Duas mudancas:
 *
 * 1. lerCor passa a ter fallback por RASTERIZACAO. Tentei primeiro o truque de
 *    `ctx.fillStyle = valor; ctx.fillStyle`, e MEDI que nao funciona -- o canvas
 *    devolve oklch/lab/color() sem converter. O que funciona e desenhar 1x1 e
 *    ler o pixel com getImageData: o canvas converte qualquer sintaxe aceita
 *    para bytes sRGB. Validado contra respostas conhecidas, incluindo
 *    `color(srgb 0.2 0.4 0.6)` -> [51,102,153] e a concordancia independente do
 *    hsl com o proprio getComputedStyle.
 *
 * 2. O que ainda nao da para avaliar deixa de ser silencioso. Fundo em imagem
 *    ou gradiente e um limite legitimo deste metodo -- contraste sobre gradiente
 *    nao se calcula assim. O erro era desistir CALADO. Agora cada elemento nao
 *    avaliado entra numa lista com motivo, a lista vai no anexo, e a execucao
 *    reprova quando os nao avaliados superam os avaliados.
 */

export type Achado = {
  criterio: string;
  gravidade: 'critical' | 'serious' | 'moderate';
  elemento: string;
  detalhe: string;
};

export type NaoAvaliado = {
  criterio: string;
  elemento: string;
  motivo: string;
};

export type ResultadoProprio = {
  contexto: string;
  achados: Achado[];
  naoAvaliados: NaoAvaliado[];
  avaliados: { textos: number; controles: number; cabecalhos: number };
};

/** Executa as verificacoes dentro da pagina. Nada depende de pacote externo. */
export async function verificarWcagSemAxe(
  page: Page,
  testInfo: TestInfo,
  contexto: string,
): Promise<ResultadoProprio> {
  const resultado = await page.evaluate(() => {
    type Achado = { criterio: string; gravidade: 'critical' | 'serious' | 'moderate'; elemento: string; detalhe: string };
    type NaoAvaliado = { criterio: string; elemento: string; motivo: string };
    const achados: Achado[] = [];
    const naoAvaliados: NaoAvaliado[] = [];

    const descrever = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className
        ? `.${(el as HTMLElement).className.trim().split(/\s+/u).slice(0, 2).join('.')}`
        : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    // ---- cor ----------------------------------------------------------------
    type Cor = [number, number, number, number];
    const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/u;

    /** Caminho rapido: a sintaxe que o getComputedStyle devolve na maioria dos casos. */
    const porRegex = (valor: string): Cor | null => {
      const m = RGB.exec(valor.trim());
      if (!m) return null;
      let a = 1;
      if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), a];
    };

    /**
     * Fallback: rasteriza 1x1 e le o pixel. Converte qualquer sintaxe que o
     * navegador aceite -- oklch, lab, color(), color-mix() -- para bytes sRGB.
     *
     * Nao use `ctx.fillStyle` de volta como valor normalizado: medido, ele
     * devolve oklch/lab/color() sem converter. Precisa rasterizar.
     */
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const pincel = canvas.getContext('2d', { willReadFrequently: true });
    const cacheDeCor = new Map<string, Cor | null>();

    const lerCor = (valor: string): Cor | null => {
      const chave = (valor ?? '').trim();
      if (!chave) return null;
      if (cacheDeCor.has(chave)) return cacheDeCor.get(chave) ?? null;

      let cor = porRegex(chave);
      if (!cor && pincel) {
        pincel.clearRect(0, 0, 1, 1);
        pincel.fillStyle = '#000000';
        const referencia = pincel.fillStyle;
        pincel.fillStyle = chave;
        // Se a cor for invalida, fillStyle nao muda. As variacoes de preto
        // precisam ser tratadas a parte, senao seriam lidas como recusadas.
        const aceitou = pincel.fillStyle !== referencia
          || ['#000000', 'black', 'rgb(0, 0, 0)'].includes(chave.toLowerCase());
        if (aceitou) {
          pincel.fillRect(0, 0, 1, 1);
          const d = pincel.getImageData(0, 0, 1, 1).data;
          cor = [d[0], d[1], d[2], d[3] / 255];
        }
      }
      cacheDeCor.set(chave, cor);
      return cor;
    };

    const sobrepor = (frente: Cor, fundo: Cor): Cor => {
      const a = frente[3] + fundo[3] * (1 - frente[3]);
      if (a === 0) return [0, 0, 0, 0];
      return [
        (frente[0] * frente[3] + fundo[0] * fundo[3] * (1 - frente[3])) / a,
        (frente[1] * frente[3] + fundo[1] * fundo[3] * (1 - frente[3])) / a,
        (frente[2] * frente[3] + fundo[2] * fundo[3] * (1 - frente[3])) / a,
        a,
      ];
    };
    const luminancia = ([r, g, b]: Cor): number => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const razao = (a: Cor, b: Cor): number => {
      const la = luminancia(a);
      const lb = luminancia(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };

    /**
     * Resolve o fundo efetivo subindo a arvore ate opacidade total.
     * Devolve o motivo quando nao da para resolver, em vez de so null.
     */
    const fundoEfetivo = (el: Element): { cor: Cor } | { motivo: string } => {
      let atual: Element | null = el;
      let acumulado: Cor = [0, 0, 0, 0];
      while (atual) {
        const estilo = getComputedStyle(atual);
        if (estilo.backgroundImage !== 'none') {
          return { motivo: `fundo e imagem ou gradiente em ${descrever(atual)}: `
            + 'contraste sobre imagem nao e calculavel por este metodo' };
        }
        const cor = lerCor(estilo.backgroundColor);
        if (cor && cor[3] > 0) {
          acumulado = acumulado[3] === 0 ? cor : sobrepor(acumulado, cor);
          if (acumulado[3] >= 0.999) return { cor: acumulado };
        }
        atual = atual.parentElement;
      }
      const base: Cor = [255, 255, 255, 1];
      return { cor: acumulado[3] === 0 ? base : sobrepor(acumulado, base) };
    };

    const visivel = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const e = getComputedStyle(el);
      return e.visibility !== 'hidden' && e.display !== 'none' && parseFloat(e.opacity || '1') > 0.05;
    };

    // ---- 1.4.3 contraste de texto -------------------------------------------
    let textos = 0;
    const comTexto = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((el) => {
      if (!visivel(el)) return false;
      return Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 1);
    });
    for (const el of comTexto) {
      const estilo = getComputedStyle(el);
      const frente = lerCor(estilo.color);
      if (!frente) {
        naoAvaliados.push({ criterio: '1.4.3', elemento: descrever(el),
          motivo: `cor de texto ilegivel para este checador: ${estilo.color}` });
        continue;
      }
      const fundo = fundoEfetivo(el);
      if ('motivo' in fundo) {
        naoAvaliados.push({ criterio: '1.4.3', elemento: descrever(el), motivo: fundo.motivo });
        continue;
      }
      textos += 1;
      const px = parseFloat(estilo.fontSize);
      const peso = parseInt(estilo.fontWeight, 10) || 400;
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);
      const minimo = grande ? 3 : 4.5;
      const r = razao(sobrepor(frente, fundo.cor), fundo.cor);
      if (r < minimo) {
        achados.push({
          criterio: '1.4.3',
          gravidade: r < minimo - 1 ? 'serious' : 'moderate',
          elemento: descrever(el),
          detalhe: `contraste ${r.toFixed(2)}:1 (minimo ${minimo}:1) `
            + `cor ${estilo.color} sobre rgb(${fundo.cor.slice(0, 3).map(Math.round).join(',')}), `
            + `${px}px peso ${peso} — "${(el.textContent ?? '').trim().slice(0, 40)}"`,
        });
      }
    }

    // ---- 1.4.11 contraste de borda de controle ------------------------------
    const controles = Array.from(document.querySelectorAll<HTMLElement>(
      'button, select, textarea, input:not([type=hidden]), [role=button], [role=checkbox], [role=combobox]',
    )).filter(visivel);
    for (const el of controles) {
      const estilo = getComputedStyle(el);
      const largura = parseFloat(estilo.borderTopWidth);
      if (!largura || estilo.borderTopStyle === 'none') continue;
      const borda = lerCor(estilo.borderTopColor);
      if (!borda) {
        naoAvaliados.push({ criterio: '1.4.11', elemento: descrever(el),
          motivo: `cor de borda ilegivel para este checador: ${estilo.borderTopColor}` });
        continue;
      }
      const fundo = fundoEfetivo(el.parentElement ?? document.body);
      if ('motivo' in fundo) {
        naoAvaliados.push({ criterio: '1.4.11', elemento: descrever(el), motivo: fundo.motivo });
        continue;
      }
      const r = razao(sobrepor(borda, fundo.cor), fundo.cor);
      if (r < 3) {
        achados.push({
          criterio: '1.4.11',
          gravidade: 'serious',
          elemento: descrever(el),
          detalhe: `borda ${estilo.borderTopColor} em ${r.toFixed(2)}:1 (minimo 3:1)`,
        });
      }
    }

    // ---- 2.5.8 alvo de toque ------------------------------------------------
    for (const el of controles) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) {
        const nome = el.getAttribute('aria-label')
          || el.closest('label')?.textContent?.trim()
          || el.textContent?.trim()
          || descrever(el);
        achados.push({
          criterio: '2.5.8',
          gravidade: 'serious',
          elemento: descrever(el),
          detalhe: `${Math.round(r.width)}x${Math.round(r.height)}px (minimo 24x24) — "${nome.slice(0, 40)}"`,
        });
      }
    }

    // ---- 4.1.2 controle sem nome acessivel ----------------------------------
    for (const el of controles) {
      const rotuloId = el.getAttribute('aria-labelledby');
      const nome = el.getAttribute('aria-label')
        || (rotuloId ? document.getElementById(rotuloId)?.textContent : '')
        || el.closest('label')?.textContent
        || (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '')
        || (el.tagName === 'BUTTON' ? el.textContent : '')
        || (el as HTMLInputElement).title
        || '';
      if (!nome.trim()) {
        achados.push({
          criterio: '4.1.2',
          gravidade: 'critical',
          elemento: descrever(el),
          detalhe: 'controle sem nome acessivel (aria-label, label ou texto)',
        });
      }
    }

    // ---- 1.3.1 ordem de cabecalhos -----------------------------------------
    const cabecalhos = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')).filter(visivel);
    let anterior = 0;
    for (const el of cabecalhos) {
      const nivel = parseInt(el.tagName.slice(1), 10);
      if (anterior && nivel > anterior + 1) {
        achados.push({
          criterio: '1.3.1',
          gravidade: 'moderate',
          elemento: descrever(el),
          detalhe: `salto de h${anterior} para h${nivel} — "${(el.textContent ?? '').trim().slice(0, 40)}"`,
        });
      }
      anterior = nivel;
    }

    // ---- 1.4.10 reflow ------------------------------------------------------
    const transbordo = document.documentElement.scrollWidth - window.innerWidth;
    if (transbordo > 1) {
      achados.push({
        criterio: '1.4.10',
        gravidade: 'serious',
        elemento: 'document',
        detalhe: `rolagem horizontal de ${transbordo}px em viewport de ${window.innerWidth}px`,
      });
    }

    return {
      achados,
      naoAvaliados,
      avaliados: { textos, controles: controles.length, cabecalhos: cabecalhos.length },
    };
  });

  const completo: ResultadoProprio = { contexto, ...resultado };
  await testInfo.attach(`wcag-proprio-${contexto}.json`, {
    body: JSON.stringify(completo, null, 2),
    contentType: 'application/json',
  });

  const avaliados = resultado.avaliados.textos + resultado.avaliados.controles;

  // Nada avaliado significa pagina vazia ou seletor errado, nao aprovacao.
  expect(
    avaliados,
    `Nenhum texto ou controle avaliado em ${contexto}: a pagina nao carregou ou o teste abriu a tela errada.`,
  ).toBeGreaterThan(0);

  /**
   * Cobertura: um checador que mediu menos da metade do que olhou nao pode
   * reportar "nenhuma violacao".
   *
   * O limite e MAIORIA, de proposito, e nao "qualquer nao-avaliado". Fundo em
   * gradiente e uso normal e legitimo; reprovar nele seria vermelho falso. Mas
   * se a maior parte da pagina nao foi medida, o verde nao significa nada e
   * precisa aparecer como falha, com a lista dos motivos.
   */
  const naoAvaliados = resultado.naoAvaliados;
  const motivos = naoAvaliados.slice(0, 12)
    .map((n) => `${n.criterio} ${n.elemento}: ${n.motivo}`).join('\n  ');
  expect(
    naoAvaliados.length,
    `Cobertura insuficiente em ${contexto}: ${naoAvaliados.length} elementos NAO avaliados `
    + `contra ${avaliados} avaliados. Verde sem cobertura nao e evidencia.\n  ${motivos}`
    + (naoAvaliados.length > 12 ? `\n  ... mais ${naoAvaliados.length - 12}` : ''),
  ).toBeLessThanOrEqual(avaliados);

  const bloqueantes = resultado.achados.filter((a) => a.gravidade === 'critical' || a.gravidade === 'serious');
  const resumo = bloqueantes.map((a) => `${a.criterio} [${a.gravidade}] ${a.elemento}: ${a.detalhe}`).join('\n  ');
  expect(bloqueantes, `Violacoes WCAG serious/critical em ${contexto}:\n  ${resumo}`).toEqual([]);
  return completo;
}
