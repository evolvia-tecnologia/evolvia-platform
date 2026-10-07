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

async function dashboardSource() {
  return readFile(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8');
}

async function workspaceSource() {
  return readFile(new URL('../components/event-workspace.tsx', import.meta.url), 'utf8');
}

async function dashboardCss() {
  return readFile(new URL('../components/event-admin-dashboard.module.css', import.meta.url), 'utf8');
}

function catalogTypes() {
  return EVENT_PROFILE_GROUPS.flatMap((group) => group.options.map((option) => option.value));
}

function scientificNavBlock(source) {
  return source.match(/\{isScientific && <>[\s\S]*?<\/>\}/u)?.[0] ?? '';
}

test('catálogo canônico possui os 20 tipos de evento da tabela', () => {
  const types = catalogTypes();
  const tableTypes = EVENT_TYPE_AVAILABILITY_TABLE.map((row) => row.eventType);

  assert.equal(types.length, 20);
  assert.equal(new Set(types).size, 20);
  assert.equal(EVENT_TYPE_AVAILABILITY_TABLE.length, 20);
  assert.deepEqual([...types].sort(), [...tableTypes].sort());

  const options = EVENT_PROFILE_GROUPS.flatMap((group) => [...group.options]);
  for (const row of EVENT_TYPE_AVAILABILITY_TABLE) {
    const option = options.find((item) => item.value === row.eventType);
    assert.ok(option, row.eventType);
    assert.equal(option.title, row.title, row.eventType);
    assert.ok(PROFILE_CODES.includes(row.profileCode), row.eventType);
  }

  assert.ok(tableTypes.includes('Feira ou exposição'));
  assert.ok(tableTypes.includes('Show ou entretenimento'));
});

test('CTA da ficha aparece no painel para qualquer um dos 20 tipos', async () => {
  const dashboard = await dashboardSource();

  assert.match(dashboard, /function registrationFormHref\(eventId: string\)/u);
  assert.match(dashboard, /return `\/eventos\/\$\{eventId\}\/painel\/inscricoes\/ficha`/u);
  assert.match(dashboard, /<RegistrationFormDashboardAccess eventId=\{eventId\} \/>/u);
  assert.match(dashboard, /<h2 id="registration-form-dashboard-title">Ficha de inscrição<\/h2>/u);
  assert.match(dashboard, /className=\{styles\.primaryButton\} href=\{commercialHref\}>Categorias e lotes/u);
  assert.match(dashboard, /className=\{styles\.secondaryButton\} href=\{href\}>Editar ficha/u);
  assert.match(
    dashboard,
    /\{configurationAvailable && <Link className=\{styles\.secondaryButton\} href=\{registrationFormHref\(eventId\)\}>Configurar ficha de inscrição<\/Link>\}/u,
  );
  const workspace = await workspaceSource();
  assert.match(workspace, /painel\/inscricoes\/ficha[\s\S]{0,240}<strong>Ficha de inscrição<\/strong>/u);

  assert.match(dashboard, /const configurationAvailable = item\.phase === 2/u);
  assert.doesNotMatch(dashboard, /configurationAvailable && isScientific|isScientific && configurationAvailable/u);

  const scientificBlock = scientificNavBlock(await workspaceSource());
  assert.match(scientificBlock, /Científico/u);
  assert.doesNotMatch(scientificBlock, /inscricoes\/ficha|Configurar ficha|RegistrationFormDashboardAccess/u);

  for (const row of EVENT_TYPE_AVAILABILITY_TABLE) {
    assert.doesNotMatch(
      dashboard,
      new RegExp(`profileCode === '${row.profileCode}'[\\s\\S]{0,180}ficha`, 'u'),
      `${row.eventType} não pode condicionar a ficha ao perfil`,
    );
    assert.doesNotMatch(
      dashboard,
      new RegExp(`eventType === '${row.eventType}'[\\s\\S]{0,180}(return null|hidden|bloquead)`, 'u'),
      `${row.eventType} não pode ocultar a ficha no painel`,
    );
  }

  for (const profileCode of PROFILE_CODES.filter((code) => code !== 'SCIENTIFIC_EVENT')) {
    assert.doesNotMatch(dashboard, new RegExp(profileCode, 'u'), profileCode);
  }
});

test('redirecionamento científico permanece seletivo e não privilegia a ficha', async () => {
  const dashboard = await dashboardSource();

  assert.match(
    dashboard,
    /payload\.event\.profileCode === 'SCIENTIFIC_EVENT' \|\| capabilities\.includes\('scientific_submission'\)/u,
  );
  assert.match(dashboard, /'scientific' in item && item\.scientific === true && !isScientific/u);
  assert.doesNotMatch(
    dashboard,
    /profileCode === 'SCIENTIFIC_EVENT'[\s\S]{0,200}inscricoes\/ficha/u,
  );
  assert.doesNotMatch(dashboard, /FAIR_EXHIBITION|ENTERTAINMENT/u);
});

test('preparação da ficha se distingue da abertura pública das inscrições', async () => {
  const dashboard = await dashboardSource();

  assert.match(dashboard, /A ficha pode ser preparada sem abrir inscrições ao público/u);
  assert.match(dashboard, /const configurationAvailable = item\.phase === 2/u);
  assert.doesNotMatch(dashboard, /inscrição pública disponível|publicar inscrições|abrir inscrição pública/iu);
  assert.doesNotMatch(dashboard, /RegistrationFormBuilder/u);
});

test('oferta da ficha no painel permanece autenticada, em português e acessível', async () => {
  const [dashboard, workspace, css] = await Promise.all([dashboardSource(), workspaceSource(), dashboardCss()]);

  assert.match(dashboard, /if \(!getToken\(\)\)/u);
  assert.match(workspace, /if \(!getToken\(\)\)/u);
  assert.match(dashboard, /router\.replace\('\/login'\)/u);
  assert.doesNotMatch(dashboard, /Authorization:\s*['"]Bearer|bypass|skipAuth|disableAuth/u);
  assert.doesNotMatch(workspace, /Authorization:\s*['"]Bearer|bypass|skipAuth|disableAuth/u);

  assert.match(dashboard, /aria-labelledby="registration-form-dashboard-title"/u);
  assert.match(dashboard, /aria-describedby="registration-form-dashboard-lead"/u);
  assert.match(dashboard, /<details className=\{styles\.journey\}>/u);
  assert.match(dashboard, /journeySummaryText/u);
  assert.match(workspace, /<a className=\{styles\.skipLink\} href="#event-admin-content">Pular para o conteúdo<\/a>/u);
  assert.match(workspace, /if \(event\.key !== 'Escape'\) return/u);
  assert.doesNotMatch(dashboard, /Configure registration|Get started|Open registrations/u);

  assert.match(
    css,
    /\.primaryButton,[\s\S]*\.secondaryButton \{[\s\S]*min-height: 44px/u,
  );
  assert.match(
    css,
    /\.navItem:focus-visible,[\s\S]*\.primaryButton:focus-visible,[\s\S]*\.secondaryButton:focus-visible/u,
  );
  assert.match(css, /width: min\(320px, 88vw\)/u);
  assert.match(
    css,
    /@media \(max-width: 700px\)[\s\S]*\.hero,[\s\S]*\.nextStep \{[\s\S]*flex-direction: column/u,
  );
});
