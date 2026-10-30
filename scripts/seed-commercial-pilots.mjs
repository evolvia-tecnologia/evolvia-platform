// Pilotos comerciais sintéticos. NUNCA executar contra produção.
// Uso: EVOLVIA_API_URL=https://homolog.../api EVOLVIA_PILOT_ALLOWED_HOST=homolog... \
// EVOLVIA_PILOT_TARGET=HOMOLOGATION EVOLVIA_PILOT_ORGANIZATION_ID=... \
// EVOLVIA_PILOT_TOKEN=... EVOLVIA_PILOT_EXECUTE=YES node scripts/seed-commercial-pilots.mjs
// Sem EXECUTE=YES, apenas valida e apresenta o plano. Não publica, envia e-mail nem cobra.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PILOTS = [
  { name: 'Summit Evolvia Corporativo 2026', type: 'Evento corporativo ou treinamento',
    profile: 'CORPORATE_TRAINING', area: 'negocios', capacity: 40 },
  { name: 'Feira Evolvia Expo 2026', type: 'Feira ou exposição',
    profile: 'FAIR_EXHIBITION', area: 'empreendedorismo', capacity: 100 },
];

export function validateTarget(env) {
  const url = new URL(env.EVOLVIA_API_URL ?? 'https://invalid.invalid');
  assert.equal(env.EVOLVIA_PILOT_TARGET, 'HOMOLOGATION', 'Alvo HOMOLOGATION obrigatório');
  assert.ok(env.EVOLVIA_PILOT_ALLOWED_HOST &&
    url.hostname === env.EVOLVIA_PILOT_ALLOWED_HOST, 'Host fora da allowlist');
  assert.match(url.hostname, /homolog|staging|dev/iu, 'Host não é de homologação');
  assert.equal(url.protocol, 'https:', 'TLS obrigatório');
  assert.equal(url.username + url.password + url.search + url.hash, '', 'URL API inválida');
  assert.ok(['', '/', '/api', '/api/'].includes(url.pathname), 'Caminho base inválido');
  // O PO autorizou exclusivamente a homologação oficial. Um host contendo
  // "homolog" (ou uma porta alternativa) não autoriza mutações reais.
  if (env.EVOLVIA_PILOT_EXECUTE === 'YES') {
    assert.equal(url.origin, 'https://homologacao.evolviatecnologia.com',
      'Execução permitida somente no host oficial de homologação, porta 443');
    assert.equal(url.pathname, '/api',
      'Execução exige a base /api da homologação oficial');
  }
  assert.ok(env.EVOLVIA_PILOT_ORGANIZATION_ID, 'Organização obrigatória');
  if (env.EVOLVIA_PILOT_EXECUTE === 'YES') {
    assert.ok(env.EVOLVIA_PILOT_TOKEN, 'Token autenticado obrigatório');
  }
  return url.href.replace(/\/$/u, '');
}

export function buildSynthetic(runId) {
  assert.match(runId, /^[a-z0-9-]{3,30}$/iu, 'Identificador sintético inválido');
  const participants = Array.from({ length: 30 }, (_, i) => ({
    name: 'Participante TESTE ' + (i + 1),
    email: 'participante-' + runId + '-' + (i + 1) + '@evolvia-ci.invalid',
    identityDocument: 'TESTE' + runId + (i + 1),
  }));
  const speakers = Array.from({ length: 5 }, (_, i) => ({ name: 'Palestrante TESTE ' + (i + 1) }));
  const staff = Array.from({ length: 3 }, (_, i) => ({ name: 'Staff TESTE ' + (i + 1) }));
  const operators = Array.from({ length: 2 }, (_, i) => ({
    name: 'Operador TESTE ' + (i + 1), role: 'OPERATOR',
  }));
  const exhibitors = Array.from({ length: 8 }, (_, i) => {
    const provider = i >= 6;
    const n = String(i + 1).padStart(2, '0');
    const email = 'expositor-' + runId + '-' + n + '@evolvia-ci.invalid';
    return {
      kind: provider ? 'PROVIDER' : 'EXHIBITOR', nationality: 'FOREIGN',
      document: 'TESTEEXPO' + runId + n, loginEmail: email,
      legalName: 'Empresa TESTE ' + n, tradeName: 'Evolvia TESTE ' + n,
      segment: provider ? 'Montagem e apoio' : '', booth: 'TESTE-' + n,
      areaLabel: 'Área TESTE', quotaExhibitor: provider ? 0 : 5,
      quotaAssembler: provider ? 2 : 1, quotaService: provider ? 3 : 1,
      contactName: 'Contato TESTE ' + n, contactRole: 'Responsável de teste',
      contactEmail: email,
    };
  });
  return { participants, speakers, staff, operators, exhibitors };
}

function requester(base, token) {
  return async (path, { method = 'GET', body, expected = 200 } = {}) => {
    const response = await fetch(base + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json', 'content-type': 'application/json',
        authorization: 'Bearer ' + token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, expected,
      method + ' ' + path + ': HTTP ' + response.status + ', esperado ' + expected);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/iu);
    return response.json();
  };
}

export async function seedPilots(env = process.env, onProgress = () => {}) {
  const base = validateTarget(env);
  const synthetic = buildSynthetic(env.EVOLVIA_PILOT_RUN_ID ?? '20261030');
  const result = {
    mode: env.EVOLVIA_PILOT_EXECUTE === 'YES' ? 'EXECUTE' : 'DRY_RUN',
    expected: { participants: 30, speakers: 5, staff: 3, operators: 2, exhibitors: 8 },
    created: [],
    notExecuted: ['inscrições', 'login externo', 'CAEX restrito', 'secretaria',
      'impressão física/PDF', 'certificados', 'publicação', 'deploy'],
  };
  if (result.mode === 'DRY_RUN') return result;
  const request = requester(base, env.EVOLVIA_PILOT_TOKEN);
  const ready = await request('/health/ready');
  assert.equal(ready.status, 'ready');
  assert.equal(ready.dependencies?.database, 'ok');
  const organizationId = env.EVOLVIA_PILOT_ORGANIZATION_ID;
  const listPath = '/events?organizationId=' + encodeURIComponent(organizationId);
  const existing = await request(listPath);
  assert.ok(Array.isArray(existing), 'Listagem inesperada');
  // Fail closed if the scoped endpoint ever returns a foreign or unscoped event.
  // Do not mutate pilot data when tenant isolation of the initial read is broken.
  assert.ok(existing.every((event) => event && event.organizationId === organizationId),
    'Listagem retornou evento fora da organização solicitada');
  for (const pilot of PILOTS) {
    assert.ok(!existing.some((event) => event.name === pilot.name),
      'Evento já existe: ' + pilot.name + '. Verificar ID; não duplicar.');
  }
  const now = Date.now();
  const startDate = new Date(now + 30 * 86400000).toISOString();
  const endDate = new Date(now + 31 * 86400000).toISOString();
  for (const pilot of PILOTS) {
    const started = await request('/event-wizard/start', {
      method: 'POST', expected: 201, body: { organizationId, eventType: pilot.type },
    });
    assert.equal(started.event.profileCode, pilot.profile);
    // The token must never create an event under another tenant, even when
    // the API responds 201. Stop before mutating commercial settings.
    assert.equal(started.event.organizationId, organizationId,
      'Wizard criado em organização divergente');
    const id = started.event.id;
    // A falha após o POST inicial deixa um evento SETUP persistido. Registrar o ID
    // imediatamente permite reconciliação manual sem duplicar o evento no retry.
    onProgress({ phase: 'wizard_started', id, name: pilot.name, profile: pilot.profile });
    const answers = {
      ...started.answers, name: pilot.name, eventType: pilot.type,
      format: 'IN_PERSON', estimatedAudience: pilot.capacity, audiencePending: false,
      startDate, endDate, timeZone: 'America/Sao_Paulo', datesPending: false,
      venue: 'Ambiente sintético TESTE', venuePending: false, registrationMode: 'FREE',
      capabilitiesCustomized: true,
      capabilities: ['registration', 'credential', 'access_control',
        ...(pilot.profile === 'FAIR_EXHIBITION' ? ['exhibitor'] : [])],
      subjectAreas: [pilot.area],
    };
    const completed = await request('/event-wizard/' + id + '/complete', {
      method: 'POST', expected: 201,
      body: { currentStep: 'review', revision: started.session.revision, answers },
    });
    assert.equal(completed.event.status, 'SETUP');
    assert.equal(completed.event.profileCode, pilot.profile);
    assert.equal(completed.event.id, id, 'Wizard retornou evento diferente');
    assert.equal(completed.event.organizationId, organizationId,
      'Conclusão do Wizard retornou organização divergente');
    assert.equal(completed.event.name, pilot.name, 'Nome do piloto não persistiu');
    const slug = completed.event.slug;
    assert.match(slug, /^[a-z0-9][a-z0-9-]{2,120}$/iu,
      'Slug do piloto ausente ou inválido');
    onProgress({ phase: 'event_setup', id, slug, name: pilot.name, profile: pilot.profile });
    const commercial = await request('/events/' + id + '/registration-commercial', {
      method: 'PUT', body: { expectedRevision: 0, categories: [{
        code: 'participante', name: 'Participante TESTE', capacity: pilot.capacity,
        proofRequirement: 'NONE', lots: [{
          code: 'unico', name: 'Gratuito TESTE', quantity: pilot.capacity,
          priceCents: 0, startsAt: new Date(now - 86400000).toISOString(), endsAt: endDate,
        }],
      }] },
    });
    assert.equal(commercial.categories?.[0]?.lots?.[0]?.priceCents, 0);
    let exhibitorCount = 0;
    let exhibitorPathFromApi = null;
    if (pilot.profile === 'FAIR_EXHIBITION') {
      for (const company of synthetic.exhibitors) {
        await request('/events/' + id + '/exhibitor/companies', {
          method: 'POST', expected: 201, body: company,
        });
      }
      const home = await request('/events/' + id + '/exhibitor');
      exhibitorCount = home.companies?.length ?? -1;
      assert.equal(exhibitorCount, 8, 'Oito empresas não persistiram');
      exhibitorPathFromApi = home.publicPath;
      assert.match(exhibitorPathFromApi, /^\/evento\/[a-z0-9%-]+\/expositor$/iu);
    }
    const persisted = await request(listPath);
    assert.ok(persisted.some((event) => event.id === id && event.slug === slug &&
      event.organizationId === organizationId && event.status === 'SETUP'),
      'Readback do evento, tenant ou estado falhou');
    const created = {
      id, slug, name: pilot.name, profile: pilot.profile, status: 'SETUP',
      categoryId: commercial.categories[0].id, exhibitorCount, exhibitorPathFromApi,
    };
    result.created.push(created);
    onProgress({ phase: 'seed_verified', ...created });
  }
  // Não publica, não envia convites, não faz cobranças. A saída só contém IDs de teste.
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await seedPilots(process.env, (checkpoint) => {
      // Apenas IDs/slugs sintéticos e fases; nunca token, credenciais ou PII.
      process.stderr.write('PILOT_CHECKPOINT ' + JSON.stringify(checkpoint) + '\n');
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write('Piloto interrompido: ' +
      (error instanceof Error ? error.message : 'erro desconhecido') + '\n');
    process.exitCode = 1;
  }
}
