import { defineConfig, devices } from '@playwright/test';

/**
 * A suite roda contra um ambiente ja publicado; ela nao sobe a aplicacao.
 * Sem EVOLVIA_E2E_BASE_URL nada executa, para nunca produzir "verde" vazio.
 */
const baseURL = process.env.EVOLVIA_E2E_BASE_URL;
if (!baseURL) {
  throw new Error(
    'Defina EVOLVIA_E2E_BASE_URL com a URL do ambiente de homologacao. '
    + 'Esta suite nao sobe a aplicacao e nao deve rodar contra producao.',
  );
}
if (/(^|\/\/)(www\.)?evolviatecnologia\.com/u.test(baseURL) && !/homolog|staging|dev|localhost|127\.0\.0\.1/u.test(baseURL)) {
  throw new Error('EVOLVIA_E2E_BASE_URL aponta para producao. Execucao bloqueada.');
}

export default defineConfig({
  testDir: './specs',
  // Os testes autenticados escrevem configuracao de etiqueta; serializar evita
  // que duas execucoes disputem a mesma categoria do mesmo evento.
  workers: process.env.CI ? 1 : undefined,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'resultados.json' }]],
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
