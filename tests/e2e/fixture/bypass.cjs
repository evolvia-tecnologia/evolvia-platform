/**
 * Fixture de duas direcoes para o criterio WCAG 2.4.1 (Bypass Blocks).
 *
 *   /quebrado  reproduz a estrutura de apps/web/app/page.tsx e /eventos/page.tsx:
 *              o <main id="main-content"> ENVOLVE o <header> com a navegacao.
 *              O skip-link existe e recebe foco, mas leva o usuario para um
 *              ponto ANTES da navegacao -- ou seja, nao pula nada.
 *
 *   /correto   reproduz apps/web/app/login/page.tsx e o
 *              components/public-help-article.tsx: header fora do <main>.
 *
 *   /sem-link  nenhum skip-link. Serve para provar que a ausencia agora
 *              REPROVA em vez de virar SKIP silencioso.
 *
 * Um teste que passe em /quebrado nao serve: era o caso do teste anterior,
 * que so verificava se o link recebia foco.
 */
const http = require('http');

const CABECALHO = `
  <header>
    <a href="/" aria-label="Evolvia - inicio">EVOLVIA</a>
    <form role="search"><label>Buscar eventos<input type="search" name="q"></label>
      <button type="submit">Buscar</button></form>
    <nav aria-label="Navega&ccedil;&atilde;o principal">
      <a href="/eventos">Eventos</a><a href="/ajuda">Ajuda</a>
      <a href="/login">Entrar</a><a href="/cadastro">Criar conta</a>
    </nav>
  </header>`;

const RODAPE = '<footer><span>Evolvia</span></footer>';
const CONTEUDO = '<section><h1>Titulo da pagina</h1><p>Conteudo.</p></section>';
const PULAR = '<a class="skip-link" href="#main-content">Pular para o conte&uacute;do principal</a>';

function pagina(corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Fixture bypass</title></head><body>${corpo}</body></html>`;
}

const PAGINAS = {
  // header DENTRO do main: o skip-link nao pula a navegacao.
  '/quebrado': pagina(`${PULAR}
    <main id="main-content" tabindex="-1">${CABECALHO}${CONTEUDO}${RODAPE}</main>`),
  // header FORA do main: estrutura correta.
  '/correto': pagina(`${PULAR}${CABECALHO}
    <main id="main-content" tabindex="-1">${CONTEUDO}</main>${RODAPE}`),
  // correto, porem com <footer> dentro de <article>: por spec NAO e contentinfo,
  // entao a checagem de landmark NAO pode acusar.
  '/card-com-footer': pagina(`${PULAR}${CABECALHO}
    <main id="main-content" tabindex="-1">${CONTEUDO}
      <article><h3>Evento</h3><footer>Publico estimado: 300 pessoas</footer></article>
    </main>${RODAPE}`),
  // sem skip-link nenhum.
  '/sem-link': pagina(`${CABECALHO}
    <main id="main-content" tabindex="-1">${CONTEUDO}</main>${RODAPE}`),
};

const servidor = http.createServer((req, res) => {
  const caminho = req.url.split('?')[0].replace(/\/$/, '') || '/quebrado';
  const corpo = PAGINAS[caminho];
  if (!corpo) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(corpo);
});

servidor.listen(Number(process.env.PORTA || 4599), '127.0.0.1', () => {
  console.log('fixture bypass em http://127.0.0.1:' + servidor.address().port);
});
