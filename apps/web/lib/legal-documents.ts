export type LegalDocumentStatus = 'REVIEW_REQUIRED' | 'APPROVED';

export type LegalDocumentSection = {
  title: string;
  reviewQuestion: string;
};

export type LegalDocumentReference = {
  label: string;
  url: string;
};

export type LegalDocument = {
  slug: 'termos-de-uso' | 'privacidade';
  title: string;
  description: string;
  status: LegalDocumentStatus;
  version: string;
  effectiveAt: null | string;
  locale: 'pt-BR';
  sections: readonly LegalDocumentSection[];
  references: readonly LegalDocumentReference[];
};

export const LEGAL_DOCUMENTS = {
  terms: {
    slug: 'termos-de-uso',
    title: 'Termos de Uso',
    description: 'Estrutura de validação dos compromissos, limites e responsabilidades no uso da Evolvia.',
    status: 'REVIEW_REQUIRED',
    version: '0.1-minuta',
    effectiveAt: null,
    locale: 'pt-BR',
    sections: [
      {
        title: 'Identificação da Evolvia e vigência',
        reviewQuestion: 'Confirmar razão social, CNPJ, endereço, canais oficiais, data de vigência e responsável pela aprovação.',
      },
      {
        title: 'Conta, identidade e credenciais',
        reviewQuestion: 'Definir elegibilidade, dever de manter dados corretos, proteção das credenciais e regras de representação de organizações.',
      },
      {
        title: 'Responsabilidades do organizador',
        reviewQuestion: 'Delimitar a responsabilidade sobre conteúdo, informações, autorizações, participantes e execução de cada evento.',
      },
      {
        title: 'Serviços, capabilities e disponibilidade',
        reviewQuestion: 'Descrever apenas recursos efetivamente oferecidos, níveis de serviço aplicáveis e dependências de terceiros.',
      },
      {
        title: 'Homologação e publicação de eventos',
        reviewQuestion: 'Formalizar que revisão, confirmação e publicação são ações explícitas do organizador autorizado.',
      },
      {
        title: 'Uso aceitável e segurança',
        reviewQuestion: 'Definir usos proibidos, prevenção a fraude, resposta a abuso, suspensão proporcional e dever de cooperação.',
      },
      {
        title: 'Propriedade intelectual',
        reviewQuestion: 'Separar direitos da plataforma, conteúdo do organizador, licenças necessárias e materiais de terceiros.',
      },
      {
        title: 'Pagamentos e condições comerciais',
        reviewQuestion: 'Incluir somente quando meios, taxas, repasses, estornos, tributos e responsabilidades estiverem aprovados.',
      },
      {
        title: 'Responsabilidade, encerramento e solução de conflitos',
        reviewQuestion: 'Validar limites compatíveis com a lei, hipóteses de término, efeitos sobre dados e foro ou método de solução.',
      },
    ],
    references: [
      {
        label: 'Marco Civil da Internet — Lei nº 12.965/2014',
        url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm',
      },
      {
        label: 'Lei Geral de Proteção de Dados — Lei nº 13.709/2018',
        url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm',
      },
    ],
  },
  privacy: {
    slug: 'privacidade',
    title: 'Política de Privacidade',
    description: 'Estrutura de validação sobre como dados pessoais serão tratados nas jornadas da Evolvia.',
    status: 'REVIEW_REQUIRED',
    version: '0.1-minuta',
    effectiveAt: null,
    locale: 'pt-BR',
    sections: [
      {
        title: 'Papéis e responsáveis pelo tratamento',
        reviewQuestion: 'Definir quando Evolvia, organizador e fornecedores atuam como controlador, operador ou suboperador.',
      },
      {
        title: 'Dados pessoais tratados',
        reviewQuestion: 'Inventariar por jornada somente dados realmente coletados de organizadores, participantes e demais atores.',
      },
      {
        title: 'Finalidades e bases legais',
        reviewQuestion: 'Relacionar cada finalidade à base legal adequada, sem usar consentimento genérico para execução contratual.',
      },
      {
        title: 'Compartilhamentos, operadores e transferências',
        reviewQuestion: 'Confirmar subprocessadores, integrações, locais de tratamento e salvaguardas para transferências internacionais.',
      },
      {
        title: 'Retenção, eliminação e portabilidade',
        reviewQuestion: 'Aprovar prazos por categoria, obrigações de conservação, descarte seguro e formatos de atendimento.',
      },
      {
        title: 'Direitos dos titulares',
        reviewQuestion: 'Definir canal, autenticação segura, prazos e fluxo para confirmação, acesso, correção, oposição e demais direitos.',
      },
      {
        title: 'Segurança e incidentes',
        reviewQuestion: 'Descrever controles compatíveis com a realidade e o processo de detecção, resposta e comunicação.',
      },
      {
        title: 'Crianças e adolescentes',
        reviewQuestion: 'Decidir quais jornadas admitem menores, responsáveis envolvidos e salvaguardas específicas.',
      },
      {
        title: 'Cookies e tecnologias semelhantes',
        reviewQuestion: 'Publicar apenas o inventário real de cookies necessários, preferências e analytics efetivamente habilitados.',
      },
      {
        title: 'Encarregado e contato de privacidade',
        reviewQuestion: 'Confirmar identidade ou canal do encarregado e meios oficiais para solicitações.',
      },
    ],
    references: [
      {
        label: 'Lei Geral de Proteção de Dados — Lei nº 13.709/2018',
        url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm',
      },
      {
        label: 'ANPD — Direitos dos titulares',
        url: 'https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares',
      },
      {
        label: 'ANPD — Guia orientativo sobre cookies',
        url: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais',
      },
    ],
  },
} as const satisfies Record<string, LegalDocument>;
