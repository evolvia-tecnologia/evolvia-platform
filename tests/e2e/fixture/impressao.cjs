#!/usr/bin/env node
/**
 * Fixture do CAMINHO DE IMPRESSAO de credencial.
 * Serve para VERIFICAR A SUITE, nao para homologar o produto.
 *
 * Modela as QUATRO camadas da protecao do PR #614, conferidas em 04/11/2026
 * contra credential-label.tsx e event-desk.tsx na branch
 * codex/credential-label-format-20261028:
 *
 *   1. o efeito de impressao automatica aborta quando fitWarning
 *   2. keydown de Ctrl/Cmd+P com preventDefault, em fase de captura
 *   3. <style> com @media print { body, body * { visibility: hidden } }
 *   4. botao `Imprimir etiqueta` disabled, onClick revalidando, e o
 *      <CredentialLabel> sem preview nao renderizado
 *
 * A variante vem de EVOLVIA_FIXTURE_IMPRESSAO, nao da rota -- ver abaixo. A
 * variante `sem-guarda` existe porque sem ela nao ha como mostrar que o teste
 * reprova quando a protecao falta, e um teste que nunca reprova nao e teste.
 */
const http = require('node:http');
const PORTA = Number(process.env.PORTA || 4701);

/**
 * Variante, por EVOLVIA_FIXTURE_IMPRESSAO:
 *   ilegivel    (padrao) fitWarning com as quatro camadas do #614
 *   legivel     imprime; e a contraprova
 *   sem-guarda  reproduz a develop: aviso presente, nada bloqueado
 *
 * A fixture serve as ROTAS REAIS (/login e o painel de check-in), para o spec
 * rodar sem nenhuma indirecao de teste. Spec que precisa de rota especial para
 * passar nao prova nada sobre a rota de verdade.
 */
const VARIANTE = process.env.EVOLVIA_FIXTURE_IMPRESSAO || 'ilegivel';
const CENARIOS = {
  'ilegivel':   { aviso: true,  guarda: true  },
  'legivel':    { aviso: false, guarda: true  },
  'sem-guarda': { aviso: true,  guarda: false },
};

const esc = (s) => String(s).replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const AVISO = 'Atenção: o conteúdo ou o QR pode não caber com legibilidade nesta dimensão. '
  + 'Aumente a etiqueta ou reduza campos e tamanho da fonte.';

function pagina({ aviso, guarda }) {
  // aviso  = fitWarning
  // guarda = aplica as quatro camadas (false reproduz a develop)
  const bloqueia = aviso && guarda;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Credenciamento</title>
<style>
  body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#111827;background:#fff}
  main{padding:16px}
  button{min-height:44px;min-width:44px;padding:0 14px;border:1px solid #7889a6;background:#fff;border-radius:6px;color:#111827}
  button:disabled{opacity:.5}
  .folha{border:1px solid #7889a6;padding:8px;border-radius:8px;width:90mm}
  [role=alert]{color:#8a1c1c}
</style></head><body><main>
<h1>Credenciamento</h1>
<section aria-label="Credencial para impressão">
  ${aviso ? `<p role="alert">${esc(AVISO)}</p>` : ''}
  <section class="folha" data-fit-warning="${aviso}" aria-label="Prévia da etiqueta">
    <p>Evento Exemplo</p><p>Ana Pesquisadora</p>
  </section>
  <button id="imprimir" type="button"${bloqueia ? ' disabled' : ''}>Imprimir etiqueta</button>
  ${(!aviso || !guarda) ? `<section class="folha" data-fit-warning="${aviso}" aria-label="Etiqueta para impressão">
    <p>Evento Exemplo</p><p>Ana Pesquisadora</p>
  </section>` : ''}
</section>
</main>
<script>
  var AVISO = ${JSON.stringify(Boolean(aviso))};
  var GUARDA = ${JSON.stringify(Boolean(guarda))};
  var bloqueia = AVISO && GUARDA;

  document.getElementById('imprimir').addEventListener('click', function () {
    if (!bloqueia) window.print();
  });

  // Camada 1: impressao automatica, abortada quando ilegivel e com guarda.
  if (!bloqueia) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { window.print(); });
    });
  }

  // Camadas 2 e 3, so quando ha guarda e a etiqueta e ilegivel.
  if (bloqueia) {
    window.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && String(ev.key).toLowerCase() === 'p') ev.preventDefault();
    }, true);
    var g = document.createElement('style');
    g.setAttribute('data-evolvia-invalid-label-print-guard', 'true');
    g.textContent = '@media print { body, body * { visibility: hidden !important; } }';
    document.head.appendChild(g);
  }
</script></body></html>`;
}

const login = () => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Entrar</title></head><body><main><h1>Entrar</h1>
<form id="f"><label>E-mail<input type="email" name="email" required></label>
<label>Senha<input type="password" name="senha" required></label>
<button type="submit">Entrar</button></form>
<script>document.getElementById('f').addEventListener('submit', function (e) {
  e.preventDefault(); location.href = '/eventos/evt-1/painel/check-in#impressao';
});</script></main></body></html>`;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const cfg = CENARIOS[VARIANTE];
  if (!cfg) {
    res.writeHead(500, { 'content-type': 'text/plain' })
      .end(`EVOLVIA_FIXTURE_IMPRESSAO invalido: ${VARIANTE}. Use ilegivel, legivel ou sem-guarda.`);
    return;
  }
  const corpo = url.pathname === '/login' ? login() : pagina(cfg);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(corpo);
}).listen(PORTA, () => {
  process.stdout.write(`fixture de impressao em http://127.0.0.1:${PORTA}`
    + ` (variante=${VARIANTE})\n`);
});
