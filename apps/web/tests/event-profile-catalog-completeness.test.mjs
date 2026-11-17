import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EVENT_PROFILE_GROUPS,
  findEventProfileGroup,
  findEventProfileOption,
  isKnownEventType,
  listEventProfileOptions,
} from '../lib/event-profile-catalog.ts';

const APPROVED_FAMILIES = [
  {
    id: 'scientific',
    label: 'Científicos e acadêmicos',
    description: 'Para eventos com conteúdo técnico, trabalhos, avaliações ou produção acadêmica.',
    options: [
      { value: 'Congresso ou evento científico', title: 'Congresso', description: 'Congressos e encontros científicos de maior porte.' },
      { value: 'Simpósio científico', title: 'Simpósio', description: 'Discussões temáticas, mesas e conteúdo especializado.' },
      { value: 'Jornada científica', title: 'Jornada', description: 'Programação técnico-científica concentrada em uma área.' },
      { value: 'Seminário acadêmico', title: 'Seminário acadêmico', description: 'Apresentações, debates e atividades de formação acadêmica.' },
      { value: 'Conferência científica', title: 'Conferência científica', description: 'Palestras, sessões e intercâmbio de conhecimento.' },
    ],
  },
  {
    id: 'corporate',
    label: 'Corporativos e capacitação',
    description: 'Para empresas, equipes, clientes, parceiros e jornadas de treinamento.',
    options: [
      { value: 'Evento corporativo ou treinamento', title: 'Evento corporativo', description: 'Encontros empresariais, reuniões ampliadas e experiências de marca.' },
      { value: 'Convenção empresarial', title: 'Convenção', description: 'Times, metas, lançamentos, canais e alinhamento estratégico.' },
      { value: 'Treinamento', title: 'Treinamento', description: 'Capacitação com presença, materiais, atividades e certificados.' },
      { value: 'Workshop', title: 'Workshop', description: 'Experiência prática, dinâmica e de menor duração.' },
      { value: 'Curso ou palestra', title: 'Curso ou palestra', description: 'Formação, atualização profissional e encontros de aprendizagem.' },
      { value: 'Networking ou meetup', title: 'Networking ou meetup', description: 'Conexões profissionais, comunidades de prática e troca de experiências.' },
    ],
  },
  {
    id: 'fair',
    label: 'Feiras e exposições',
    description: 'Para ambientes com expositores, visitantes, credenciais e operação de acesso.',
    options: [
      { value: 'Feira ou exposição', title: 'Feira', description: 'Expositores, credenciais, serviços e fluxo de visitantes.' },
      { value: 'Exposição', title: 'Exposição', description: 'Mostras, estandes e experiências abertas ou credenciadas.' },
    ],
  },
  {
    id: 'entertainment',
    label: 'Entretenimento',
    description: 'Para eventos orientados a ingressos, entrada e experiência do público.',
    options: [
      { value: 'Show ou entretenimento', title: 'Show', description: 'Ingressos, operação de entrada e experiência ao vivo.' },
      { value: 'Festival', title: 'Festival', description: 'Programação múltipla, público amplo e operação de acesso.' },
    ],
  },
  {
    id: 'community',
    label: 'Comunidades, causas e esportes',
    description: 'Para encontros sociais, religiosos, beneficentes, comunitários ou esportivos.',
    options: [
      { value: 'Evento social ou comunitário', title: 'Social ou comunitário', description: 'Mobilização, integração de comunidades e participação social.' },
      { value: 'Evento religioso ou beneficente', title: 'Religioso ou beneficente', description: 'Encontros, retiros e ações orientadas por uma causa.' },
      { value: 'Evento esportivo ou torneio', title: 'Esportivo ou torneio', description: 'Competições, jogos, provas e experiências esportivas.' },
      { value: 'Corrida', title: 'Corrida', description: 'Provas de corrida, com entrega de material sugerida na configuração inicial.' },
    ],
  },
  {
    id: 'other',
    label: 'Outros perfis',
    description: 'Para formatos que não se encaixam nas opções anteriores.',
    options: [
      { value: 'Outro tipo de evento', title: 'Outro perfil', description: 'Comece com uma estrutura flexível e adapte depois.' },
    ],
  },
];

const APPROVED_FAMILY_IDS = APPROVED_FAMILIES.map((family) => family.id);
const APPROVED_TYPE_VALUES = APPROVED_FAMILIES.flatMap((family) => family.options.map((option) => option.value));
const APPROVED_TITLES = APPROVED_FAMILIES.flatMap((family) => family.options.map((option) => option.title));

function unique(values) {
  return [...new Set(values)];
}

test('catálogo canônico tem exatamente 6 famílias e 20 tipos na ordem aprovada', () => {
  assert.equal(EVENT_PROFILE_GROUPS.length, 6);
  assert.equal(listEventProfileOptions().length, 20);
  assert.deepEqual(EVENT_PROFILE_GROUPS.map((group) => group.id), APPROVED_FAMILY_IDS);
  assert.deepEqual(listEventProfileOptions().map((option) => option.value), APPROVED_TYPE_VALUES);
});

test('famílias e tipos preservam labels, títulos e descrições PT-BR aprovados', () => {
  assert.deepEqual(
    EVENT_PROFILE_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      description: group.description,
      options: group.options.map((option) => ({
        value: option.value,
        title: option.title,
        description: option.description,
      })),
    })),
    APPROVED_FAMILIES,
  );
});

test('IDs de família, valores e títulos são obrigatórios, não vazios e únicos', () => {
  const familyIds = EVENT_PROFILE_GROUPS.map((group) => group.id);
  const values = listEventProfileOptions().map((option) => option.value);
  const titles = listEventProfileOptions().map((option) => option.title);

  for (const group of EVENT_PROFILE_GROUPS) {
    assert.equal(typeof group.id, 'string');
    assert.ok(group.id.trim().length > 0, `família sem id: ${group.label}`);
    assert.ok(group.label.trim().length > 0, `família ${group.id} sem label`);
    assert.ok(group.description.trim().length > 0, `família ${group.id} sem descrição`);
    assert.ok(group.options.length > 0, `família ${group.id} sem tipos`);

    for (const option of group.options) {
      assert.equal(typeof option.value, 'string');
      assert.equal(typeof option.title, 'string');
      assert.equal(typeof option.icon, 'string');
      assert.ok(option.value.trim().length > 0, `tipo sem value em ${group.id}`);
      assert.ok(option.title.trim().length > 0, `tipo sem title em ${group.id}`);
      assert.ok(option.icon.trim().length > 0, `tipo sem ícone: ${option.value}`);
      assert.ok(option.description.trim().length > 0, `tipo sem descrição: ${option.value}`);
    }
  }

  assert.deepEqual(unique(familyIds), familyIds);
  assert.deepEqual(unique(values), values);
  assert.deepEqual(unique(titles), titles);
  assert.deepEqual(unique(APPROVED_TYPE_VALUES), APPROVED_TYPE_VALUES);
  assert.deepEqual(unique(APPROVED_TITLES), APPROVED_TITLES);
});

test('Outro perfil permanece como fallback determinístico no fim do catálogo', () => {
  const lastFamily = EVENT_PROFILE_GROUPS.at(-1);
  const lastOption = listEventProfileOptions().at(-1);

  assert.equal(lastFamily?.id, 'other');
  assert.equal(lastFamily?.label, 'Outros perfis');
  assert.equal(lastFamily?.options.length, 1);
  assert.equal(lastOption?.value, 'Outro tipo de evento');
  assert.equal(lastOption?.title, 'Outro perfil');
  assert.equal(findEventProfileGroup('Outro tipo de evento')?.id, 'other');
});

test('consultas do contrato resolvem os 20 tipos e recusam valores desconhecidos', () => {
  for (const option of listEventProfileOptions()) {
    const group = findEventProfileGroup(option.value);
    assert.ok(group, option.value);
    assert.equal(findEventProfileOption(option.value)?.title, option.title);
    assert.equal(isKnownEventType(option.value), true);
    assert.ok(group.options.some((candidate) => candidate.value === option.value));
  }

  for (const unknown of [undefined, null, '', '  ', 19, 'Congresso', 'outro tipo de evento']) {
    assert.equal(findEventProfileGroup(unknown), undefined);
    assert.equal(findEventProfileOption(unknown), undefined);
    assert.equal(isKnownEventType(unknown), false);
  }
});

test('Wizard e Home continuam consumindo o mesmo catálogo, sem segunda fonte', async () => {
  const [wizard, home, picker] = await Promise.all([
    readFile(new URL('../components/event-wizard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/public-profile-picker.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(wizard, /import \{ EVENT_PROFILE_GROUPS \} from '\.\.\/lib\/event-profile-catalog'/u);
  assert.match(wizard, /EVENT_PROFILE_GROUPS\.map\(\(group\) =>/u);
  assert.match(wizard, /group\.options\.map\(\(profile\) =>/u);
  assert.match(wizard, /update\('eventType', profile\.value\)/u);
  assert.match(wizard, /<strong>\{profile\.title\}<\/strong>/u);
  assert.doesNotMatch(wizard, /EVENT_PROFILE_GROUPS\s*=/u);

  assert.match(home, /import \{ findEventProfileGroup \} from '\.\.\/lib\/event-profile-catalog'/u);
  assert.match(home, /<PublicProfilePicker /u);
  assert.match(picker, /import \{ EVENT_PROFILE_GROUPS, findEventProfileGroup \} from '\.\.\/lib\/event-profile-catalog'/u);
  assert.match(picker, /EVENT_PROFILE_GROUPS\.map\(\(group\) =>/u);
  assert.equal(
    listEventProfileOptions().some((option) => option.value === 'Corrida' && option.title === 'Corrida'),
    true,
    'A EVA e a Home usam este catálogo e precisam oferecer Corrida.',
  );
  assert.match(picker, /family\.options\.map\(\(profile\) =>/u);
  assert.match(home, /findEventProfileGroup\(parsed\.eventType\)/u);
  assert.doesNotMatch(home, /EVENT_PROFILE_GROUPS\s*=/u);
  assert.doesNotMatch(picker, /EVENT_PROFILE_GROUPS\s*=/u);
});
