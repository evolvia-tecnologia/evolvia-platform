/**
 * Prova do predicado temAvisoDeAjuste.
 *
 * O predicado antigo casava '[data-fit-warning], [role=alert]'. Como a develop
 * nao tem data-fit-warning mas PODE ter um [role=alert] qualquer (erro de rede,
 * validacao de formulario), ele declarava a capacidade PRESENTE e disparava as
 * assercoes inteiras do #614 contra a develop -- vermelho falso.
 *
 * A rota /sem-capacidade-com-alerta existe so para isso: e o caso em que o
 * antigo acerta por acidente o lado errado.
 */
const http = require('http');

const PAGINAS = {
  // develop: sem data-fit-warning. Capacidade AUSENTE.
  '/sem-capacidade': '<section aria-label="Pr&eacute;via da etiqueta" data-qr="false" data-barcode="false">etiqueta</section>',
  // develop + um alerta QUALQUER. Ainda AUSENTE.
  '/sem-capacidade-com-alerta': '<div role="alert">Nao foi possivel salvar.</div>'
    + '<section aria-label="Pr&eacute;via da etiqueta" data-qr="false">etiqueta</section>',
  // PR #614: data-fit-warning existe. Capacidade PRESENTE.
  '/com-capacidade': '<section aria-label="Pr&eacute;via da etiqueta" data-fit-warning="false">etiqueta</section>',
};

http.createServer((req, res) => {
  const caminho = req.url.split('?')[0].replace(/\/$/, '');
  const corpo = PAGINAS[caminho];
  if (!corpo) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fixture aviso</title></head><body>${corpo}</body></html>`);
}).listen(Number(process.env.PORTA || 4601), '127.0.0.1', function () {
  console.log('fixture aviso em http://127.0.0.1:' + this.address().port);
});
