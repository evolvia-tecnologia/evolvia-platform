#!/usr/bin/env node
/**
 * Fixture local que replica o DOM real de credential-category-templates.tsx.
 * Serve para VERIFICAR A SUITE, nao para homologar o produto.
 *
 * Variante controlada por EVOLVIA_FIXTURE_FORMATACAO=1: inclui a barra de
 * formatacao do PR #614, para provar que a deteccao de capacidade sai de SKIP
 * e passa a asserir de verdade.
 */
const http = require('node:http');
const PORTA = Number(process.env.PORTA || 4700);
const COM_FORMATACAO = process.env.EVOLVIA_FIXTURE_FORMATACAO === '1';
const TRANSBORDO = process.env.EVOLVIA_FIXTURE_TRANSBORDO === '1';

const PADRAO = [
  ['preferred_name', 'Nome para crachá (como gostaria de ser chamado)'],
  ['institution', 'Empresa'],
  ['city_state', 'Cidade / Estado'],
  ['qr', 'Código QR'],
];
// Estado no servidor: recarregar prova gravacao, como na aplicacao real.
let salvo = null;

const AMOSTRAS = {
  preferred_name: 'Ana Pesquisadora', institution: 'Empresa Exemplo',
  city_state: 'Osasco / SP', qr: '',
};

const esc = (s) => String(s).replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
:root{--texto:#111827;--fundo:#ffffff;--borda:#8a9cb5;--sutil:#5b6b84}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,sans-serif;color:var(--texto);background:var(--fundo)}
main{padding:16px;max-width:100%}
h1{font-size:1.5rem}h3{font-size:1.15rem}h4{font-size:1rem}
ol.campos{list-style:none;padding:0;display:grid;gap:8px}
ol.campos li{display:grid;gap:8px;padding:8px;border:1px solid var(--borda);border-radius:8px}
.acoes{display:flex;gap:8px}
.acoes button{min-width:44px;min-height:44px;border:1px solid var(--borda);background:#fff;border-radius:6px;color:var(--texto)}
.barra{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px 16px}
.barra label{display:grid;gap:4px;font-size:.85rem;color:var(--sutil)}
.barra select{min-height:44px;border:1px solid var(--borda);border-radius:6px;color:var(--texto);background:#fff}
.barra .negrito{display:flex;align-items:center;gap:8px;font-size:.85rem}
.barra input[type=checkbox]{width:24px;height:24px}
.rodape{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.rodape button{min-height:44px;padding:0 14px;border:1px solid var(--borda);background:#fff;border-radius:6px;color:var(--texto)}
.previa{border:1px solid var(--borda);padding:8px;border-radius:8px;margin-top:16px}
.previa p{margin:2px 0}
label.categoria{display:grid;gap:4px;max-width:320px}
label.categoria select{min-height:44px;border:1px solid var(--borda);border-radius:6px;color:var(--texto);background:#fff}
form{display:grid;gap:12px;max-width:320px}
form label{display:grid;gap:4px}
form input{min-height:44px;border:1px solid var(--borda);border-radius:6px;padding:0 8px;color:var(--texto)}
form button{min-height:44px;border:1px solid var(--borda);background:#fff;border-radius:6px;color:var(--texto)}
${TRANSBORDO ? '.vilao{position:absolute;top:400px;left:0;width:420px;height:16px;background:#ccc}' : ''}
`;

function pagina(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><style>${CSS}</style></head><body>${corpo}</body></html>`;
}

function barra(code, rotulo) {
  if (!COM_FORMATACAO) return '';
  return `<div class="barra">
  <label>Alinhamento de ${esc(rotulo)}
    <select aria-label="Alinhamento de ${esc(rotulo)}" name="align-${esc(code)}">
      <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
    </select></label>
  <label class="negrito"><input type="checkbox" name="bold-${esc(code)}"> Negrito</label>
  <label>Cor de ${esc(rotulo)}
    <select aria-label="Cor de ${esc(rotulo)}" name="color-${esc(code)}">
      <option value="#111827">Preto</option><option value="#1d4ed8">Azul</option><option value="#be123c">Vermelho</option>
    </select></label>
  <label>Tipo de fonte de ${esc(rotulo)}
    <select aria-label="Tipo de fonte de ${esc(rotulo)}" name="font-${esc(code)}">
      <option value="sans-serif">Sem serifa</option><option value="serif">Com serifa</option>
    </select></label>
  <label>Tamanho da fonte de ${esc(rotulo)}
    <select aria-label="Tamanho da fonte de ${esc(rotulo)}" name="size-${esc(code)}">
      <option value="3">3 mm</option><option value="3.5">3,5 mm</option><option value="4">4 mm</option>
    </select></label>
</div>`;
}

function painel() {
  const campos = salvo ?? PADRAO;
  const itens = campos.map(([code, rotulo], i) => `<li data-code="${esc(code)}">
  <span><strong>${i + 1}.</strong> ${esc(rotulo)}</span>
  <div class="acoes">
    <button type="button" aria-label="Subir ${esc(rotulo)}"${i === 0 ? ' disabled' : ''} data-mover="-1">↑</button>
    <button type="button" aria-label="Descer ${esc(rotulo)}"${i === campos.length - 1 ? ' disabled' : ''} data-mover="1">↓</button>
    <button type="button" aria-label="Remover ${esc(rotulo)}" data-remover="1">Remover</button>
  </div>
  ${barra(code, rotulo)}
</li>`).join('\n');

  const previaLinhas = ['Exemplo de evento', ...campos.map(([c, r]) => AMOSTRAS[c] ?? r).filter(Boolean)]
    .map((t) => `<p>${esc(t)}</p>`).join('');

  return pagina('Credenciamento', `<main>
<h1>Credenciamento</h1>
<section aria-labelledby="t"><header><h3 id="t">Configuração de etiquetas</h3></header>
<label class="categoria">Categoria do evento
  <select><option value="c1">Participante</option><option value="c2">Palestrante</option></select></label>
<div>
  <div>
    <h4>Campos e ordem de impressão</h4>
    <ol class="campos">${itens}</ol>
    <div class="rodape">
      <button type="button" id="restaurar">Restaurar padrão</button>
      <button type="button" id="salvar">Salvar modelo da categoria</button>
    </div>
    <p role="status" id="aviso" hidden>Modelo de etiqueta salvo</p>
  </div>
  <aside aria-label="Prévia do crachá da categoria">
    <h4>Prévia · Participante</h4>
    <section class="previa" aria-label="Prévia da etiqueta">${previaLinhas}</section>
  </aside>
</div></section>
${TRANSBORDO ? '<div class="vilao">largo de proposito</div>' : ''}
</main>
<script>
const ordem = () => Array.from(document.querySelectorAll('ol.campos li')).map(li => li.dataset.code);
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  const li = b.closest('li');
  if (b.dataset.mover && li) {
    const passo = Number(b.dataset.mover);
    const irmao = passo < 0 ? li.previousElementSibling : li.nextElementSibling;
    if (irmao) { passo < 0 ? li.parentNode.insertBefore(li, irmao) : li.parentNode.insertBefore(irmao, li); renumerar(); }
  }
  if (b.dataset.remover && li) { li.remove(); renumerar(); }
  if (b.id === 'restaurar') { location.href = '?reset=1'; }
  if (b.id === 'salvar') {
    await fetch('/api/salvar', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campos: ordem() }) });
    document.getElementById('aviso').hidden = false;
  }
});
function renumerar() {
  document.querySelectorAll('ol.campos li').forEach((li, i, todos) => {
    li.querySelector('strong').textContent = (i + 1) + '.';
    const [subir, descer] = li.querySelectorAll('.acoes button');
    subir.disabled = i === 0; descer.disabled = i === todos.length - 1;
  });
  const previa = document.querySelector('[aria-label="Prévia da etiqueta"]');
  const amostras = ${JSON.stringify(AMOSTRAS)};
  previa.innerHTML = '<p>Exemplo de evento</p>' + Array.from(document.querySelectorAll('ol.campos li'))
    .map(li => amostras[li.dataset.code] ?? li.querySelector('span').textContent.replace(/^\\d+\\.\\s*/, ''))
    .filter(Boolean).map(t => '<p>' + t + '</p>').join('');
}
</script>`);
}

const login = () => pagina('Entrar', `<main><h1>Entrar</h1>
<form id="f"><label>E-mail<input type="email" name="email" required></label>
<label>Senha<input type="password" name="senha" required></label>
<button type="submit">Entrar</button></form>
<script>document.getElementById('f').addEventListener('submit', e => {
  e.preventDefault(); location.href = '/eventos/evt-1/painel/check-in';
});</script></main>`);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/salvar') {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      try {
        const { campos } = JSON.parse(corpo);
        const mapa = new Map(PADRAO);
        salvo = campos.map((c) => [c, mapa.get(c) ?? c]);
      } catch { /* corpo invalido: mantem estado */ }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
    return;
  }
  if (url.searchParams.get('reset') === '1') salvo = null;
  const corpo = url.pathname === '/login' ? login() : painel();
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(corpo);
}).listen(PORTA, () => {
  process.stdout.write(`fixture em http://127.0.0.1:${PORTA}`
    + ` (formatacao=${COM_FORMATACAO ? 'sim' : 'nao'}, transbordo=${TRANSBORDO ? 'sim' : 'nao'})\n`);
});
