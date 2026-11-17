/**
 * Reproduz a troca de rotulos de
 * apps/web/app/organizacoes/[id]/dados-fiscais/page.tsx:
 *   kind === 'COMPANY' ? 'Razao social' : 'Nome completo'
 *   kind === 'COMPANY' ? 'CNPJ' : 'CPF'
 * e 'Nome fantasia (opcional)' so em COMPANY.
 *
 * /quebrado fixa os rotulos de PJ mesmo em PF: e o que um teste que nao
 * conhecesse a troca assumiria. Ele TEM de reprovar.
 */
const http = require('http');

const campo = (rotulo, extra = '') => `<label>${rotulo}<input ${extra}></label>`;

function pagina({ trocaRotulos }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dados legais</title></head><body>
<main id="main-content">
<h1>Quem responde pela organiza&ccedil;&atilde;o?</h1>
<form>
<fieldset><legend>Tipo de respons&aacute;vel</legend>
  <label><input type="radio" name="kind" id="pj" checked onclick="trocar('COMPANY')"> Pessoa jur&iacute;dica</label>
  <label><input type="radio" name="kind" id="pf" onclick="trocar('PERSON')"> Pessoa f&iacute;sica</label>
</fieldset>
<div id="dinamico"></div>
<h2>Endere&ccedil;o da entidade</h2>
${['CEP', 'Logradouro', 'N&uacute;mero', 'Bairro', 'Cidade', 'UF'].map((r) => campo(r, 'required')).join('')}
${campo('Carteira Asaas para repasse')}
<button type="button">Salvar dados da organiza&ccedil;&atilde;o</button>
</form>
</main>
<script>
var TROCA = ${trocaRotulos};
function trocar(kind) {
  var pj = kind === 'COMPANY' || !TROCA;   // sem troca, sempre mostra os de PJ
  var html = '<label>' + (pj ? 'Raz&atilde;o social' : 'Nome completo') + '<input required></label>'
           + (pj ? '<label>Nome fantasia (opcional)<input></label>' : '')
           + '<label>' + (pj ? 'CNPJ' : 'CPF') + '<input required></label>'
           + '<label>E-mail de contato<input required type="email"></label>';
  document.getElementById('dinamico').innerHTML = html;
}
trocar('COMPANY');
</script>
</body></html>`;
}

const PAGINAS = {
  '/correto': pagina({ trocaRotulos: true }),
  '/quebrado': pagina({ trocaRotulos: false }),
};

http.createServer((req, res) => {
  const caminho = req.url.split('?')[0].replace(/\/$/, '');
  const corpo = PAGINAS[caminho];
  if (!corpo) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1>'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(corpo);
}).listen(Number(process.env.PORTA || 4605), '127.0.0.1', function () {
  console.log('fixture legal em http://127.0.0.1:' + this.address().port);
});
