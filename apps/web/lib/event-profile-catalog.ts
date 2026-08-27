export const EVENT_PROFILE_GROUPS = [
  {
    id: 'scientific',
    label: 'Científicos e acadêmicos',
    description: 'Para eventos com conteúdo técnico, trabalhos, avaliações ou produção acadêmica.',
    options: [
      { value: 'Congresso ou evento científico', icon: '◫', title: 'Congresso', description: 'Congressos e encontros científicos de maior porte.' },
      { value: 'Simpósio científico', icon: '◫', title: 'Simpósio', description: 'Discussões temáticas, mesas e conteúdo especializado.' },
      { value: 'Jornada científica', icon: '◫', title: 'Jornada', description: 'Programação técnico-científica concentrada em uma área.' },
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
    id: 'other',
    label: 'Outros perfis',
    description: 'Quando o evento tem finalidade social, comunitária ou uma combinação diferente.',
    options: [
      { value: 'Evento social ou comunitário', icon: '◎', title: 'Social ou comunitário', description: 'Uma jornada simples para mobilizar e receber participantes.' },
      { value: 'Outro tipo de evento', icon: '+', title: 'Outro perfil', description: 'Comece com uma estrutura flexível e adapte depois.' },
    ],
  },
] as const;

export function findEventProfileGroup(eventType: unknown) {
  if (typeof eventType !== 'string') return undefined;
  return EVENT_PROFILE_GROUPS.find((group) =>
    group.options.some((option) => option.value === eventType),
  );
}
