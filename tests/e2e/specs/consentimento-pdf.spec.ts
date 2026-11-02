import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Consentimento e seguranca do PDF de termos — CL-05.
 *
 *     EVOLVIA_E2E_MODO=inventario npx playwright test --grep @consentimento
 *
 * Limitacao declarada, e importante: registration-terms-document.policy.ts
 * importa BadRequestException de @nestjs/common, que nao resolve de dentro de
 * tests/e2e. Entao este spec NAO chama validateRegistrationTermsPdf; ele le o
 * arquivo-fonte, extrai as constantes e os padroes de verdade e os exercita.
 *
 * Isso basta para o que a CL-05 pede verificar — limite de nome, tamanho,
 * assinatura e recursos bloqueados sao exatamente constantes e expressoes — e
 * nao basta para autorizacao, tenant e persistencia de aceite, que dependem de
 * banco e de requisicao. Aqueles continuam marcados como pendentes de ambiente.
 *
 * A diferenca entre "exercito o padrao real extraido do fonte" e "exercito a
 * funcao" esta registrada de proposito: a primeira nao cobre a ordem das
 * checagens dentro da funcao nem os caminhos de erro do wrapper.
 */

const FONTE = join(
  __dirname, '..', '..', '..',
  'apps', 'api', 'src', 'registration-terms-document.policy.ts',
);

async function fonte(): Promise<string> {
  return readFile(FONTE, 'utf8');
}

/** Extrai um literal de expressao regular pelo nome da constante. */
function extrairRegex(texto: string, nome: string): RegExp {
  const m = new RegExp(`const\\s+${nome}\\s*=\\s*/((?:[^/\\\\\\n]|\\\\.)+)/([a-z]*)`, 'u').exec(texto);
  if (!m) throw new Error(`Nao achei a constante ${nome} em ${FONTE}`);
  return new RegExp(m[1], m[2]);
}

/** Extrai o padrao de nome de arquivo, que e literal dentro da funcao. */
function extrairPadraoNome(texto: string): RegExp {
  const m = /if\s*\(!\/(\^.+?)\/([a-z]*)\.test\(cleaned\)\)/u.exec(texto);
  if (!m) throw new Error('Nao achei o padrao de nome de arquivo.');
  return new RegExp(m[1], m[2]);
}

function nomeLimpo(valor: string): string {
  // Mesma normalizacao de registrationTermsFileName, antes do teste do padrao.
  const base = valor.split(/[\\/]/u).pop()?.normalize('NFKC').trim() ?? '';
  return base.replace(/[^\p{L}\p{N} ._()-]/gu, '');
}

test.describe('Consentimento: PDF de termos @consentimento @gate-consentimento', () => {
  test('o fonte da politica esta no lugar esperado', async () => {
    // Ancora: sem ela, tudo abaixo mede o vazio.
    const texto = await fonte();
    expect(texto, 'arquivo vazio ou caminho errado').toContain('validateRegistrationTermsPdf');
    expect(texto).toContain('registrationTermsFileName');
    expect(texto).toContain('checksumSha256');
  });

  test('o aceite guarda hash SHA-256 do arquivo', async () => {
    const texto = await fonte();
    // Versao e hash sao o que torna o aceite auditavel: sem hash, nao da para
    // provar DEPOIS qual documento a pessoa aceitou.
    expect(texto).toMatch(/createHash\(\s*'sha256'\s*\)/u);
    expect(texto).toMatch(/checksumSha256:\s*createHash/u);
  });

  test('tamanho maximo e 5 MB, e o limite vale tambem apos descompressao', async () => {
    const texto = await fonte();
    const m = /const\s+MAX_BYTES\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/u.exec(texto);
    expect(m, 'MAX_BYTES precisa existir').not.toBeNull();
    const bytes = Number(m![1]) * Number(m![2]) * Number(m![3]);
    expect(bytes).toBe(5 * 1024 * 1024);
    // Bomba de descompressao: o orcamento precisa ser decrementado a cada filtro.
    expect(texto, 'o limite precisa valer para o conteudo descomprimido')
      .toMatch(/budget\.remaining\s*-=\s*body\.length/u);
    expect(texto).toMatch(/maxOutputLength:\s*budget\.remaining/u);
  });

  test('assinatura do arquivo e verificada, nao a extensao', async () => {
    const texto = await fonte();
    // %PDF- nos primeiros 5 bytes: extensao nao decide nada.
    expect(texto).toMatch(/subarray\(0,\s*5\)\.toString\('latin1'\)\s*!==\s*'%PDF-'/u);
    // HTML disfarcado de PDF e recusado explicitamente.
    expect(texto).toMatch(/<!doctype\|<html\|<script/iu);
  });

  test('recursos ativos de PDF sao bloqueados', async () => {
    const bloqueados = extrairRegex(await fonte(), 'BLOCKED_PDF_FEATURES');
    // Cada um destes e um vetor real de execucao ou de exfiltracao.
    for (const recurso of [
      '/JavaScript', '/JS', '/Launch', '/SubmitForm', '/ImportData',
      '/EmbeddedFile', '/RichMedia', '/OpenAction', '/XFA', '/GoToR', '/Rendition',
    ]) {
      expect(bloqueados.test(`1 0 obj << ${recurso} 2 0 R >>`), `${recurso} precisa ser bloqueado`).toBe(true);
    }
    // Um PDF simples e passivo nao casa.
    expect(bloqueados.test('1 0 obj << /Type /Page /Contents 4 0 R >>')).toBe(false);
  });

  test('PDF com senha e recusado', async () => {
    const texto = await fonte();
    expect(texto).toMatch(/\/\\\/Encrypt\\b\/u\.test\(ascii\)/u);
  });

  test('o nome do arquivo recusa travessia de caminho e extensao errada', async () => {
    const padrao = extrairPadraoNome(await fonte());
    // Travessia: so o ultimo segmento sobrevive, e ele precisa casar.
    expect(padrao.test(nomeLimpo('../../etc/passwd')), 'travessia nao pode passar').toBe(false);
    expect(padrao.test(nomeLimpo('C:\\Windows\\System32\\termos.pdf')), 'o basename valido passa').toBe(true);
    expect(padrao.test(nomeLimpo('termos.pdf.exe'))).toBe(false);
    expect(padrao.test(nomeLimpo('termos.html'))).toBe(false);
    expect(padrao.test(nomeLimpo('.pdf')), 'precisa comecar com letra ou numero').toBe(false);
    expect(padrao.test(nomeLimpo('termos de inscricao (2026).pdf'))).toBe(true);
    // Caractere perigoso e removido antes do teste, nao aceito.
    expect(nomeLimpo('term<script>os.pdf')).toBe('termscriptos.pdf');
  });

  // ---- a divergencia que a CL-05 pede verificar --------------------------

  test('o limite real de fileName e 120 caracteres', async ({}, testInfo) => {
    const padrao = extrairPadraoNome(await fonte());

    // Procura o maior nome aceito, em vez de confiar na leitura do padrao.
    let maior = 0;
    for (let total = 5; total <= 200; total += 1) {
      const nome = `a${'b'.repeat(total - 5)}.pdf`;
      if (nome.length !== total) break;
      if (padrao.test(nomeLimpo(nome))) maior = total;
    }
    testInfo.annotations.push({
      type: 'divergencia-requisito-codigo',
      description: `A CL-05 fala de "limite real fileName 120". Medido no padrao do `
        + `fonte, o maior nome aceito tem ${maior} caracteres. O padrao e `
        + `{0,70} apos o primeiro caractere, mais ".pdf": 1 + 70 + 4 = 75.`,
    });

    expect(
      maior,
      `O maior nome de arquivo aceito tem ${maior} caracteres, nao 120.\n\n`
      + 'O padrao em registrationTermsFileName e\n'
      + '  /^[\\p{L}\\p{N}][\\p{L}\\p{N} ._()-]{0,70}\\.pdf$/iu\n'
      + 'ou seja 1 caractere inicial + ate 70 + ".pdf" = 75 no maximo.\n\n'
      + 'Um teste de homologacao escrito contra 120 enviaria um nome de 120 '
      + 'caracteres esperando aceite e receberia recusa — e seria lido como '
      + 'defeito do produto, nao como requisito desatualizado.\n\n'
      + 'Decidir qual numero vale. Se 120 e o requisito, o padrao precisa virar '
      + '{0,115}. Se 75 e o certo, corrigir a CL-05. Nao alterei nenhum dos dois.',
    ).toBe(120);
  });
});
