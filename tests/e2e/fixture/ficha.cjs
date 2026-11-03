/**
 * Reproduz a caixa de termos de registration-form-builder.tsx, com as tres
 * armadilhas reais:
 *   - DOIS input[type=file]: o dos termos e a previa do campo PHOTO;
 *   - DOIS role=status: o aviso de "crie categorias" e o notice de sucesso;
 *   - o botao e "Anexar PDF"/"Substituir PDF", e /salvar/ casa "Salvar rascunho".
 *
 * Duas rotas servem para CONFIRMAR os defeitos da versao anterior da
 * jornada-1b, nao so para validar a correcao.
 */
const http = require('http');

function pagina({ comAnexo, semCategorias }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha</title></head><body>
<main>
<h1>Ficha de inscri&ccedil;&atilde;o</h1>
${semCategorias ? '<div role="status"><p>Crie primeiro as categorias e os lotes.</p></div>' : '<p>Em cada campo, marque Mostrar apenas para.</p>'}
<div id="aviso"></div>
<section>
  <h2>0 habilitados de 0 campos</h2>
  <button id="rascunho" disabled>Salvar rascunho</button>
</section>
<aside>
  <h2>Ficha do participante</h2>
  <div>
    <strong>Termos e Pol&iacute;tica de Privacidade</strong>
    <p id="estado">${comAnexo ? 'Anexado: termos-teste.pdf &middot; vers&atilde;o 1' : 'Nenhum PDF anexado.'}</p>
    <label>PDF dos termos<input type="file" id="pdf" accept="application/pdf,.pdf"></label>
    <button type="button" id="anexar" disabled>${comAnexo ? 'Substituir PDF' : 'Anexar PDF'}</button>
    ${comAnexo ? '<button type="button">Abrir PDF anexado</button>' : ''}
  </div>
  <div id="previa">
    <label><span>Foto</span><input disabled type="file" accept="image/*"></label>
  </div>
  <button id="preservar" ${comAnexo ? '' : 'disabled'}>Preservar vers&atilde;o para testes</button>
  ${comAnexo ? '' : '<small>Anexe o PDF dos termos antes de preservar uma vers&atilde;o.</small>'}
</aside>
</main>
<script>
document.getElementById('pdf').addEventListener('change', function () {
  document.getElementById('anexar').disabled = !this.files.length;
});
document.getElementById('anexar').addEventListener('click', function () {
  document.getElementById('aviso').innerHTML =
    '<div role="status">PDF dos termos anexado: termos-teste.pdf.</div>';
  document.getElementById('estado').textContent = 'Anexado: termos-teste.pdf · versão 1';
});
</script>
</body></html>`;
}

const PAGINAS = {
  '/sem-anexo': pagina({ comAnexo: false, semCategorias: false }),
  '/sem-anexo-sem-categorias': pagina({ comAnexo: false, semCategorias: true }),
  '/com-anexo': pagina({ comAnexo: true, semCategorias: false }),
};

http.createServer((req, res) => {
  const caminho = req.url.split('?')[0].replace(/\/$/, '');
  const corpo = PAGINAS[caminho];
  if (!corpo) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(corpo);
}).listen(Number(process.env.PORTA || 4607), '127.0.0.1', function () {
  console.log('fixture ficha em http://127.0.0.1:' + this.address().port);
});
