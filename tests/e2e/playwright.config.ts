import { defineConfig, devices } from '@playwright/test';
import { avaliarAmbiente } from './support/ambiente-seguro';

/**
 * A suite roda contra um ambiente ja publicado; ela nao sobe a aplicacao.
 * Sem EVOLVIA_E2E_BASE_URL nada executa, para nunca produzir "verde" vazio.
 *
 * Excecao: EVOLVIA_E2E_MODO=inventario permite `playwright test --list` e
 * checagem de tipos sem ambiente, para o CI conferir que a suite compila e
 * contar casos. A URL do inventario usa o TLD .invalid, que a RFC 2606 reserva
 * para nunca resolver: nenhuma requisicao consegue sair.
 */
const inventario = process.env.EVOLVIA_E2E_MODO === 'inventario';
const baseURL = process.env.EVOLVIA_E2E_BASE_URL ?? (inventario ? 'http://inventario.invalid' : undefined);
if (!baseURL) {
  throw new Error(
    'Defina EVOLVIA_E2E_BASE_URL com a URL do ambiente de homologacao. '
    + 'Esta suite nao sobe a aplicacao e nao deve rodar contra producao. '
    + 'Para apenas listar os casos, use EVOLVIA_E2E_MODO=inventario.',
  );
}

/**
 * Guarda de ambiente. Recusa por padrao -- ver support/ambiente-seguro.ts.
 *
 * A versao anterior deste arquivo tinha um furo: ela testava
 *     /(^|\/\/)(www\.)?evolviatecnologia\.com/
 * contra a STRING da URL, o que so reprova producao quando o host vem
 * imediatamente depois de `//`, com `www.` opcional. Logo
 * `https://app.evolviatecnologia.com/` NAO casava, e era ACEITO. Como esta
 * suite faz login e SALVA categoria, lote e beneficio, apontada para um
 * subdominio de producao ela escreveria em dados reais de clientes.
 *
 * Aplicado sempre, inclusive no modo inventario: isento, bastaria
 * EVOLVIA_E2E_MODO=inventario com uma URL de producao para passar direto.
 */
const veredito = avaliarAmbiente(baseURL);
if (!veredito.seguro) throw new Error(veredito.motivo);

export default defineConfig({
  testDir: './specs',
  // Os testes autenticados escrevem configuracao de etiqueta; serializar evita
  // que duas execucoes disputem a mesma categoria do mesmo evento.
  workers: process.env.CI ? 1 : undefined,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    // Relator proprio: separa SKIP declarado de aprovacao e reprova a execucao
    // quando um gate obrigatorio nao roda. Ver support/relatorio.ts.
    ['./support/relatorio.ts'],
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'resultados.json' }],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } } },
    // 320px e o piso de WCAG 2.2 (criterio 1.4.10, reflow).
    { name: 'mobile-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 }, isMobile: false } },
    { name: 'mobile-390', use: { ...devices['iPhone 13'] } },
  ],
});
