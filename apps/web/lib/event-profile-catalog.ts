/** Catálogo canônico Web: 6 famílias e 20 tipos. Fonte única do Wizard, da Home e da EVA. */
export const EVENT_PROFILE_GROUPS = [
  {
    id: 'scientific',
    label: 'Científicos e acadêmicos',
    description: 'Para eventos com conteúdo técnico, trabalhos, avaliações ou produção acadêmica.',
    options: [
      { value: 'Congresso ou evento científico', icon: '◫', title: 'Congresso', description: 'Congressos e encontros científicos de maior porte.' },
      { value: 'Simpósio científico', icon: '◫', title: 'Simpósio', description: 'Discussões temáticas, mesas e conteúdo especializado.' },
      { value: 'Jornada científica', icon: '◫', title: 'Jornada', description: 'Programação técnico-científica concentrada em uma área.' },
      { value: 'Seminário acadêmico', icon: '◫', title: 'Seminário acadêmico', description: 'Apresentações, debates e atividades de formação acadêmica.' },
      { value: 'Conferência científica', icon: '◫', title: 'Conferência científica', description: 'Palestras, sessões e intercâmbio de conhecimento.' },
    ],
  },
  {
    id: 'corporate',
    label: 'Corporativos e capacitação',
    description: 'Para empresas, equipes, clientes, parceiros e jornadas de treinamento.',
    options: [
      { value: 'Evento corporativo ou treinamento', icon: '◇', title: 'Evento corporativo', description: 'Encontros empresariais, reuniões ampliadas e experiências de marca.' },
      { value: 'Convenção empresarial', icon: '◇', title: 'Convenção', description: 'Times, metas, lançamentos, canais e alinhamento estratégico.' },
      { value: 'Treinamento', icon: '◇', title: 'Treinamento', description: 'Capacitação com presença, materiais, atividades e certificados.' },
      { value: 'Workshop', icon: '◇', title: 'Workshop', description: 'Experiência prática, dinâmica e de menor duração.' },
      { value: 'Curso ou palestra', icon: '◇', title: 'Curso ou palestra', description: 'Formação, atualização profissional e encontros de aprendizagem.' },
      { value: 'Networking ou meetup', icon: '◇', title: 'Networking ou meetup', description: 'Conexões profissionais, comunidades de prática e troca de experiências.' },
    ],
  },
  {
    id: 'fair',
    label: 'Feiras e exposições',
    description: 'Para ambientes com expositores, visitantes, credenciais e operação de acesso.',
    options: [
      { value: 'Feira ou exposição', icon: '▦', title: 'Feira', description: 'Expositores, credenciais, serviços e fluxo de visitantes.' },
      { value: 'Exposição', icon: '▦', title: 'Exposição', description: 'Mostras, estandes e experiências abertas ou credenciadas.' },
    ],
  },
  {
    id: 'entertainment',
    label: 'Entretenimento',
    description: 'Para eventos orientados a ingressos, entrada e experiência do público.',
    options: [
      { value: 'Show ou entretenimento', icon: '▶', title: 'Show', description: 'Ingressos, operação de entrada e experiência ao vivo.' },
      { value: 'Festival', icon: '▶', title: 'Festival', description: 'Programação múltipla, público amplo e operação de acesso.' },
    ],
  },
  {
    id: 'community',
    label: 'Comunidades, causas e esportes',
    description: 'Para encontros sociais, religiosos, beneficentes, comunitários ou esportivos.',
    options: [
      { value: 'Evento social ou comunitário', icon: '◎', title: 'Social ou comunitário', description: 'Mobilização, integração de comunidades e participação social.' },
      { value: 'Evento religioso ou beneficente', icon: '◎', title: 'Religioso ou beneficente', description: 'Encontros, retiros e ações orientadas por uma causa.' },
      { value: 'Evento esportivo ou torneio', icon: '◎', title: 'Esportivo ou torneio', description: 'Competições, jogos, provas e experiências esportivas.' },
      { value: 'Corrida', icon: '◎', title: 'Corrida', description: 'Provas de corrida, com entrega de material sugerida na configuração inicial.' },
    ],
  },
  {
    id: 'other',
    label: 'Outros perfis',
    description: 'Para formatos que não se encaixam nas opções anteriores.',
    options: [
      { value: 'Outro tipo de evento', icon: '+', title: 'Outro perfil', description: 'Comece com uma estrutura flexível e adapte depois.' },
    ],
  },
] as const;

export type EventProfileGroup = (typeof EVENT_PROFILE_GROUPS)[number];
export type EventProfileOption = EventProfileGroup['options'][number];
export type EventProfileFamilyId = EventProfileGroup['id'];
export type EventProfileTypeValue = EventProfileOption['value'];

export function listEventProfileOptions(): readonly EventProfileOption[] {
  return EVENT_PROFILE_GROUPS.flatMap((group) => [...group.options]);
}

export function findEventProfileGroup(eventType: unknown) {
  if (typeof eventType !== 'string') return undefined;
  return EVENT_PROFILE_GROUPS.find((group) =>
    group.options.some((option) => option.value === eventType),
  );
}

export function findEventProfileOption(eventType: unknown) {
  if (typeof eventType !== 'string') return undefined;
  return findEventProfileGroup(eventType)?.options.find((option) => option.value === eventType);
}

export function isKnownEventType(eventType: unknown): eventType is EventProfileTypeValue {
  return findEventProfileOption(eventType) !== undefined;
}
