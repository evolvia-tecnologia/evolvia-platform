import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EVENT_PROFILE_GROUPS } from '../lib/event-profile-catalog.ts';

const EVENT_TYPE_AVAILABILITY_TABLE = [
  { eventType: 'Congresso ou evento científico', title: 'Congresso', profileCode: 'SCIENTIFIC_EVENT' },
  { eventType: 'Simpósio científico', title: 'Simpósio', profileCode: 'SCIENTIFIC_EVENT' },
  { eventType: 'Jornada científica', title: 'Jornada', profileCode: 'SCIENTIFIC_EVENT' },
  { eventType: 'Seminário acadêmico', title: 'Seminário acadêmico', profileCode: 'SCIENTIFIC_EVENT' },
  { eventType: 'Conferência científica', title: 'Conferência científica', profileCode: 'SCIENTIFIC_EVENT' },
  { eventType: 'Evento corporativo ou treinamento', title: 'Evento corporativo', profileCode: 'CORPORATE_TRAINING' },
  { eventType: 'Convenção empresarial', title: 'Convenção', profileCode: 'CORPORATE_TRAINING' },
  { eventType: 'Treinamento', title: 'Treinamento', profileCode: 'CORPORATE_TRAINING' },
  { eventType: 'Workshop', title: 'Workshop', profileCode: 'CORPORATE_TRAINING' },
  { eventType: 'Curso ou palestra', title: 'Curso ou palestra', profileCode: 'CORPORATE_TRAINING' },
  { eventType: 'Networking ou meetup', title: 'Networking ou meetup', profileCode: 'CORPORATE_TRAINING' },
  { eventType: 'Feira ou exposição', title: 'Feira', profileCode: 'FAIR_EXHIBITION' },
  { eventType: 'Exposição', title: 'Exposição', profileCode: 'FAIR_EXHIBITION' },
  { eventType: 'Show ou entretenimento', title: 'Show', profileCode: 'ENTERTAINMENT' },
  { eventType: 'Festival', title: 'Festival', profileCode: 'ENTERTAINMENT' },
  { eventType: 'Evento social ou comunitário', title: 'Social ou comunitário', profileCode: 'SOCIAL_COMMUNITY' },
  { eventType: 'Evento religioso ou beneficente', title: 'Religioso ou beneficente', profileCode: 'SOCIAL_COMMUNITY' },
  { eventType: 'Evento esportivo ou torneio', title: 'Esportivo ou torneio', profileCode: 'SOCIAL_COMMUNITY' },
  { eventType: 'Corrida', title: 'Corrida', profileCode: 'SOCIAL_COMMUNITY' },
  { eventType: 'Outro tipo de evento', title: 'Outro perfil', profileCode: 'OTHER' },
];

const PROFILE_CODES = [
  'SCIENTIFIC_EVENT',
  'CORPORATE_TRAINING',
  'FAIR_EXHIBITION',
  'ENTERTAINMENT',
  'SOCIAL_COMMUNITY',
  'OTHER',
];

async function routerSource() {
  return readFile(new URL('../components/event-configuration-router.tsx', import.meta.url), 'utf8');
}

async function pageSource() {
  return readFile(new URL('../app/eventos/[id]/configuracao/page.tsx', import.meta.url), 'utf8');
}

function catalogTypes() {
  return EVENT_PROFILE_GROUPS.flatMap((group) => group.options.map((option) => option.value));
}

test('catálogo canônico possui os 20 tipos de evento da tabela', () => {
  const types = catalogTypes();
  const tableTypes = EVENT_TYPE_AVAILABILITY_TABLE.map((row) => row.eventType);

  assert.equal(types.length, 20);
  assert.equal(new Set(types).size, 20);
  assert.equal(EVENT_TYPE_AVAILABILITY_TABLE.length, 20);
  assert.deepEqual([...types].sort(), [...tableTypes].sort());

  for (const row of EVENT_TYPE_AVAILABILITY_TABLE) {
    const option = EVENT_PROFILE_GROUPS
      .flatMap((group) => group.options.map((item) => item))
      .find((item) => item.value === row.eventType);
    assert.ok(option, row.eventType);
    assert.equal(option.title, row.title, row.eventType);
    assert.ok(PROFILE_CODES.includes(row.profileCode), row.eventType);
  }
});

test('nenhum perfil da tabela bloqueia a rota ou a configuração da ficha', async () => {
  const [router, page] = await Promise.all([routerSource(), pageSource()]);

  assert.match(page, /EventConfigurationRouter eventId=\{params\.id\}/u);
  assert.doesNotMatch(page, /profileCode|SCIENTIFIC_EVENT|FAIR_EXHIBITION|ENTERTAINMENT/u);

  assert.match(router, /\/eventos\/\$\{eventId\}\/painel\/inscricoes\/ficha/u);
  assert.match(router, /Configurar ficha de inscrição/u);
  assert.match(router, /sessionStatus === 'COMPLETED'/u);
  assert.match(router, /<RegistrationFormAccess/u);

  for (const row of EVENT_TYPE_AVAILABILITY_TABLE) {
    assert.doesNotMatch(
      router,
      new RegExp(`profileCode === '${row.profileCode}'[\\s\\S]{0,180}ficha`, 'u'),
      `${row.eventType} não pode condicionar a ficha ao perfil`,
    );
    assert.doesNotMatch(
      router,
      new RegExp(`profileCode === '${row.profileCode}'[\\s\\S]{0,180}(return null|hidden|bloquead)`, 'u'),
      `${row.eventType} não pode ocultar a configuração por perfil`,
    );
  }

  for (const profileCode of PROFILE_CODES.filter((code) => code !== 'SCIENTIFIC_EVENT')) {
    assert.doesNotMatch(router, new RegExp(profileCode, 'u'), profileCode);
  }
});

test('redirecionamento científico após o Wizard permanece seletivo e legítimo', async () => {
  const router = await routerSource();

  assert.match(
    router,
    /payload\.session\.status === 'COMPLETED' && !reviewRequested/u,
  );
  assert.match(router, /router\.replace\(`\/eventos\/\$\{eventId\}\/painel`\)/u);
  assert.doesNotMatch(
    router,
    /profileCode === 'SCIENTIFIC_EVENT' && payload\.session\.status === 'COMPLETED'[\s\S]{0,160}inscricoes\/ficha/u,
  );
});

test('preparação da ficha se distingue da abertura pública das inscrições', async () => {
  const router = await routerSource();

  assert.match(router, /Preparar e versionar a ficha não abre inscrições ao público/u);
  assert.match(router, /disponível para todos os perfis de evento/u);
  assert.doesNotMatch(router, /abrir inscrições|inscrição pública disponível|publicar inscrições/iu);
});

test('oferta da ficha permanece autenticada, em português e acessível', async () => {
  const router = await routerSource();

  assert.match(router, /if \(!getToken\(\)\)/u);
  assert.match(router, /router\.replace\('\/login'\)/u);
  assert.doesNotMatch(router, /Authorization:\s*['"]Bearer|bypass|skipAuth|disableAuth/u);

  assert.match(router, /aria-labelledby="registration-form-access-title"/u);
  assert.match(router, /aria-describedby="registration-form-access-lead"/u);
  assert.match(router, /<h1 id="registration-form-access-title">Ficha de inscrição<\/h1>/u);
  assert.match(router, /className="btn btn-primary"/u);
  assert.match(router, /Revisar fundação/u);
});
