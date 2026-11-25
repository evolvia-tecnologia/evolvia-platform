import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { montarSql as provisionar } from './provisionar-proprietario-master.policy.mjs';
import { montarSql as abrirJanela } from './recuperar-acesso-master.policy.mjs';
import { openChromiumCdp, stopChrome } from './validate-public-accessibility-runtime.mjs';

const project = process.env.COMPOSE_PROJECT_NAME;
assert.ok(process.env.GITHUB_ACTIONS === 'true' && process.env.EVOLVIA_CI_MODE === '1'
  && process.env.EVOLVIA_AMBIENTE === 'ci' && /^evolvia-ci-\d+$/.test(project), 'Exige banco descartável do CI');

function sql(statement) {
  const run = spawnSync('docker', ['compose', '--env-file', '.env.ci', '-p', project, 'exec', '-T',
    'postgres', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'evolvia_ci', '-d', 'evolvia_ci'],
  { input: statement, encoding: 'utf8' });
  assert.equal(run.status, 0, 'Operação no PostgreSQL descartável');
  return run.stdout.trim();
}

async function post(path, body) {
  const res = await fetch('http://127.0.0.1:4000' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(res.status, 201, path);
  return res.json();
}

const identidade = randomUUID();
const email = 'master-' + identidade + '@evolvia-ci.local';
const conta = await post('/auth/register', { email, name: 'Proprietário CI', password: randomBytes(24).toString('hex') + 'Aa!' });
const token = createHmac('sha256', process.env.JWT_SECRET).update('email-verification:' + conta.user.id).digest('hex');
await post('/auth/email-verification/confirm', { token });
const nota = 'Ensaio descartável do primeiro acesso';
sql(provisionar({ email, identidadeId: identidade, nota, correlacao: randomUUID() }));
const segredo = randomBytes(32).toString('base64url');
sql(abrirJanela({ finalidade: 'BOOTSTRAP', email, identidade, nota, correlacao: randomUUID(), minutos: 5, segredo }));

const browser = await openChromiumCdp();
try {
  const { cdp } = browser;
  async function evaluate(expression) {
    const value = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    assert.ok(!value.exceptionDetails, 'Execução no navegador');
    return value.result.value;
  }
  async function waitFor(expression, label) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(200);
    }
    throw new Error('Tempo excedido em ' + label);
  }
  await cdp.send('Page.enable');
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "if(location.origin==='http://localhost:3000')localStorage.setItem('evolvia_token'," + JSON.stringify(conta.token) + ")",
  });
  await cdp.send('Page.navigate', { url: 'http://localhost:3000/master' });
  await waitFor("Boolean(document.querySelector('details input[type=password]'))", 'formulário de inscrição');
  await evaluate("document.querySelector('details summary').click()");
  await evaluate("const input=document.querySelector('details input[type=password]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input," + JSON.stringify(segredo) + ");input.dispatchEvent(new Event('input',{bubbles:true}));");
  await evaluate("document.querySelector('details button').click()");
  await waitFor("document.body.innerText.includes('Chave registrada.')", 'registro WebAuthn');
  assert.equal(sql(`SELECT count(*) FROM "PlatformMasterEnrollmentWindow" WHERE "identityId"='${identidade}' AND "consumedAt" IS NOT NULL`), '1');
  assert.equal(sql(`SELECT count(*) FROM "PlatformMasterSession" WHERE "identityId"='${identidade}'`), '0');
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Entrar com a chave')).click()");
  await waitFor("document.body.innerText.includes('Visão geral da plataforma')", 'autenticação do proprietário');
  assert.equal(sql(`SELECT count(*) FROM "PlatformMasterSession" WHERE "identityId"='${identidade}' AND "revokedAt" IS NULL`), '1');
  console.log('PostgreSQL e Chromium confirmaram inscrição, consumo único registrado e autenticação posterior.');
} finally {
  await stopChrome(browser);
}
