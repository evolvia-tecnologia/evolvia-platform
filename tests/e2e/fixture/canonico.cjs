/**
 * Prova da assercao de canonical do endereco publico curto.
 *
 * Tres rotas:
 *   /{slug}          canonical -> /{slug}        (correto, passa)
 *   /evento/{slug}   canonical -> /{slug}        (legado aponta para o curto, passa)
 *   /regressao       canonical -> /evento/{slug}  (tem de REPROVAR)
 *
 * A terceira existe porque uma assercao que nao reprova a regressao nao serve.
 */
const http = require('http');

const SLUG = 'meu-evento-2026';
const BASE = 'https://homologacao.evolviatecnologia.com';

const pagina = (canonical) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Evento</title><link rel="canonical" href="${canonical}"></head>
<body><main id="main-content"><h1>Congresso de Teste 2026</h1></main></body></html>`;

const PAGINAS = {
  [`/${SLUG}`]: pagina(`${BASE}/${SLUG}`),
  [`/evento/${SLUG}`]: pagina(`${BASE}/${SLUG}`),
  '/regressao': pagina(`${BASE}/evento/${SLUG}`),
};

http.createServer((req, res) => {
  const caminho = decodeURIComponent(req.url.split('?')[0].replace(/\/$/, ''));
  const corpo = PAGINAS[caminho];
  if (!corpo) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(corpo);
}).listen(Number(process.env.PORTA || 4603), '127.0.0.1', function () {
  console.log('fixture canonico em http://127.0.0.1:' + this.address().port);
});
