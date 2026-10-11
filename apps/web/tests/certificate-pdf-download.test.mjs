import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../lib/certificate-pdf-download.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { downloadCertificatePdf } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function browser(response) {
  const clicks = [];
  const requests = [];
  globalThis.window = {
    setTimeout: () => 0,
    document: {
      body: { appendChild: () => {} },
      createElement: () => { const link = { click: () => clicks.push({ href: link.href, download: link.download }), remove: () => {} }; return link; },
    },
  };
  globalThis.fetch = async (path, options) => {
    requests.push({ path, options });
    if (response instanceof Error) throw response;
    return response;
  };
  return { clicks, requests };
}

test('PDF disponível baixa como certificado.pdf sem mensagem', async () => {
  const h = browser({ ok: true, blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });
  assert.equal(await downloadCertificatePdf('ab'.repeat(16)), null);
  assert.equal(h.requests[0].path, `/api/public/certificates/${'ab'.repeat(16)}/pdf`);
  assert.equal(h.clicks.length, 1);
  assert.equal(h.clicks[0].download, 'certificado.pdf');
});

test('PDF recusado mostra a explicação do servidor em vez de abrir JSON', async () => {
  const message = 'O PDF ainda não desenha estes caracteres: 王 小 明. Nada foi trocado no certificado.';
  const h = browser({ ok: false, status: 422, json: async () => ({ message }) });
  assert.equal(await downloadCertificatePdf('ab'.repeat(16)), message);
  assert.equal(h.clicks.length, 0);
  browser(new Error('rede'));
  assert.match(await downloadCertificatePdf('ab'.repeat(16)), /pode ser impressa/u);
});
