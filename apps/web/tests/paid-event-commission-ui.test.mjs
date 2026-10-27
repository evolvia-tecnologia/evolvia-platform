import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('financeiro explica a faixa de 10% a 15% e monta a EVA uma vez', async () => {
  const page = await read('../app/eventos/[id]/painel/financeiro/page.tsx');
  assert.equal([...page.matchAll(/<EvaScreenSupport/gu)].length, 1);
  assert.match(page, /data\.commission\.minPercent\}% a \{data\.commission\.maxPercent\}%/u);
  assert.match(page, /certificado e trabalho científico não têm taxa/iu);
  assert.match(page, /não oferece boleto/u);
  assert.match(page, /até 6 vezes/u);
  assert.doesNotMatch(page, /até 12 vezes/u);
  assert.match(page, /feeBearer: bearer/u);
  assert.doesNotMatch(page, /fetch\(|openai|https:\/\//iu);
  assert.doesNotMatch(page, /19,90|3,99|2,50/u);
});

test('inscrição mostra a comissão antes de reservar e uma EVA por tela', async () => {
  const form = await read('../components/public-registration-form.tsx');
  assert.equal([...form.matchAll(/<EvaScreenSupport/gu)].length, 1);
  assert.match(form, /comissão da Evolvia/u);
  assert.match(form, /Certificado e trabalho científico não têm taxa/u);
  assert.match(form, /A EVA não vê nem guarda o cartão/u);
  assert.doesNotMatch(form, /fetch\(['"]https?:\/\/(?!\/)/u);
  assert.doesNotMatch(form, /19,90|3,99|2,50/u);
});

test('dados da organização pedem a carteira e não uma chave', async () => {
  const page = await read('../app/organizacoes/[id]/dados-fiscais/page.tsx');
  assert.match(page, /asaasWalletId/u);
  assert.match(page, /Não cole chave de API/u);
});
