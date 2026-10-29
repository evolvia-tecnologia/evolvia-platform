import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('G2.10: public paid registration links a distinct 2-10 participant checkout route', async () => {
  const [single, page, group] = await Promise.all([
    read('../components/public-registration-form.tsx'),
    read('../app/evento/[slug]/inscricao/grupo/page.tsx'),
    read('../components/public-registration-group-form.tsx'),
  ]);
  assert.match(single, /inscricao\\/grupo/u);
  assert.match(page, /<PublicRegistrationGroupForm/u);
  assert.match(group, /entries\.length >= 10/u);
  assert.match(group, /entries\.length <= 2/u);
  assert.match(group, /Participante \{index \+ 1\}/u);
  assert.match(group, /terms_acceptance/u);
  assert.match(group, /proofRequirement === 'REQUIRED_BEFORE_PAYMENT'/u);
  assert.match(group, /role="alert"/u);
});

test('G2.10: preview is not a reservation, grouped order uses a stable private capability', async () => {
  const [group, page] = await Promise.all([
    read('../components/public-registration-group-form.tsx'),
    read('../app/evento/[slug]/inscricao/page.tsx'),
  ]);
  assert.match(group, /post\(base \+ '\/preview'/u);
  assert.match(group, /post\(base, requestBody\(\), key\)/u);
  assert.match(group, /crypto\.randomUUID\(\)/u);
  assert.match(group, /sessionStorage\.setItem\(storageKey\(created\.orderId\), key\)/u);
  assert.match(group, /headers: \{ 'idempotency-key': key \}/u);
  assert.match(group, /post\(base \+ '\/' \+ encodeURIComponent\(order\.orderId\) \+ '\/checkout'/u);
  assert.match(group, /Atualizar confirmação/u);
  assert.match(page, /redirect\('\/evento\/'/u);
  assert.doesNotMatch(group, /localStorage\.setItem/u);
  assert.doesNotMatch(group, /window\.location\.search.*idempotency/u);
});

test('G2.10: payment stays manual, redirects only to allowlisted Asaas origins', async () => {
  const group = await read('../components/public-registration-group-form.tsx');
  assert.match(group, /\['asaas\.com', 'www\.asaas\.com', 'sandbox\.asaas\.com'\]/u);
  assert.match(group, /window\.location\.assign\(url\.toString\(\)\)/u);
  assert.match(group, /order\.status === 'PENDING_PAYMENT'/u);
  assert.match(group, /Não crie outro pedido nem tente nova cobrança/u);
  assert.doesNotMatch(group, /useEffect\(\(\) => \{\s*void pay\(/u);
});
