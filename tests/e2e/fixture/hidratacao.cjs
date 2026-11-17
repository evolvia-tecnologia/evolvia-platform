/**
 * Reproduz o que a critica da #571 aponta: controle que so aparece DEPOIS da
 * hidratacao.
 *
 * `locator.count()` nao espera, entao um detector de capacidade baseado em
 * count() imediato declara a capacidade AUSENTE e o teste vira SKIP falso -- a
 * capacidade existia, so nao tinha renderizado ainda.
 *
 *   /tardio   o controle aparece depois de ATRASO ms  (count() imediato PERDE)
 *   /ausente  o controle nunca aparece               (os dois acertam)
 *   /imediato o controle ja vem no HTML              (os dois acertam)
 *
 * A rota /tardio e a que importa: e o unico caso em que os dois detectores
 * discordam, e por isso a unica que prova a correcao.
 */
const http = require('http');
const ATRASO = Number(process.env.ATRASO || 700);

const pagina = (corpo, script = '') => `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><title>Hidratacao</title></head><body><main>
<h1>Editor de etiquetas</h1><ol><li id="campo">Nome</li></ol>${corpo}
</main><script>${script}</script></body></html>`;

const CONTROLE = '<section aria-label="Pr&eacute;via da etiqueta" data-fit-warning="false">previa</section>';

const PAGINAS = {
  '/imediato': pagina(CONTROLE),
  '/ausente': pagina('<section aria-label="Pr&eacute;via da etiqueta" data-qr="false">previa</section>'),
  '/tardio': pagina('', `setTimeout(function () {
    document.querySelector('main').insertAdjacentHTML('beforeend',
      '<section aria-label="Previa da etiqueta" data-fit-warning="false">previa</section>');
  }, ${ATRASO});`),
};

http.createServer((req, res) => {
  const caminho = req.url.split('?')[0].replace(/\/$/, '');
  const corpo = PAGINAS[caminho];
  if (!corpo) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(corpo);
}).listen(Number(process.env.PORTA || 4609), '127.0.0.1', function () {
  console.log('fixture hidratacao em http://127.0.0.1:' + this.address().port + ' (atraso ' + ATRASO + 'ms)');
});
