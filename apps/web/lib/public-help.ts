export type PublicHelpArticle = {
  slug: string;
  title: string;
  description: string;
  paragraphs: string[];
  points: string[];
};

export const PUBLIC_HELP_ARTICLES: readonly PublicHelpArticle[] = [
  {
    slug: 'inscricoes',
    title: 'Inscrições',
    description: 'A inscrição pública abre só quando o evento está publicado e há vaga no lote.',
    paragraphs: [
      'A pessoa escolhe categoria e lote, preenche a ficha do evento e recebe um protocolo. Se a vaga for paga, o pagamento segue para o checkout seguro. O valor final é calculado no servidor.',
      'Evento gratuito, pago ou por convite usa a mesma página. O botão da divulgação muda o texto: comprar inscrição, comprar ingresso, quero me inscrever ou tenho um convite.',
    ],
    points: [
      'A ficha pode ser preparada antes de abrir as inscrições ao público.',
      'Cupom, convite e cortesia são conferidos na reserva, sem expor a lista de códigos.',
      'O participante acompanha a situação na área do próprio evento.',
    ],
  },
  {
    slug: 'programacao',
    title: 'Programação',
    description: 'A programação publicada é a que o organizador decidiu mostrar, não um rascunho interno.',
    paragraphs: [
      'No evento científico, atividades, salas e pessoas passam por conferência antes de entrar na programação definitiva. Nos demais eventos, o que o público precisa saber vai para as seções da página publicada.',
      'Horário, local e informações importantes ficam na mesma página do evento, junto da inscrição e de como chegar.',
    ],
    points: [
      'Conflito de pessoa ou de sala é tratado na organização, antes da publicação.',
      'A página pública não mostra rascunho, parecer ou dado de outro evento.',
    ],
  },
  {
    slug: 'certificados',
    title: 'Certificados',
    description: 'A Evolvia já guarda a inscrição e a credencial. A emissão automática de certificado ainda não é uma promessa desta versão.',
    paragraphs: [
      'O participante consulta o protocolo, a situação da inscrição e a credencial de entrada. Quando o organizador tiver um certificado para entregar, essa informação deve aparecer nos canais oficiais do evento.',
      'Não há selo automático nem envio em massa de certificado nesta versão. Isso evita prometer um documento que o sistema ainda não emite.',
    ],
    points: [
      'A credencial de entrada já pode ser apresentada na área do participante.',
      'O certificado, quando existir, precisa ser o documento do organizador, não uma suposição da página.',
    ],
  },
  {
    slug: 'credenciamento',
    title: 'Credenciamento',
    description: 'A entrada usa a credencial da inscrição confirmada, lida pela equipe do evento.',
    paragraphs: [
      'Depois da inscrição confirmada, a área do participante mostra a credencial daquele evento. A equipe valida a leitura na entrada. Uma mesma credencial de participante não entra duas vezes.',
      'A operação vê protocolo, categoria e situação. E-mail e documento não aparecem na lista de busca da entrada.',
    ],
    points: [
      'O acesso da equipe é separado da credencial de quem se inscreveu.',
      'Evento presencial, híbrido ou show usa a mesma ideia: uma credencial, uma entrada.',
    ],
  },
  {
    slug: 'trabalhos-cientificos',
    title: 'Trabalhos científicos',
    description: 'Submissão, avaliação e programação científica ficam no evento que precisa delas.',
    paragraphs: [
      'O autor envia o trabalho a partir da área do participante, depois da inscrição confirmada. A avaliação e a decisão ficam com a comissão do evento.',
      'Evento corporativo, show ou treinamento não é obrigado a abrir submissão. A Evolvia esconde essa etapa quando ela não faz parte do perfil.',
    ],
    points: [
      'O nome do autor na submissão vem da inscrição, sem criar outro cadastro paralelo.',
      'Há um planejador para a comissão organizar critérios antes de abrir o envio.',
    ],
  },
  {
    slug: 'acessibilidade',
    title: 'Acessibilidade',
    description: 'O site público é navegável por teclado, com foco visível e texto que se ajusta à tela.',
    paragraphs: [
      'No início de cada página há um link para pular ao conteúdo. Os botões e links principais têm área de toque confortável. O movimento decorativo respeita a preferência de reduzir animação.',
      'Cada evento pode publicar um resumo de acessibilidade escrito pelo organizador. Se esse resumo não existir, a página diz isso em vez de inventar rampa, intérprete ou recurso.',
    ],
    points: [
      'A busca de eventos funciona sem mouse: os filtros são campos de um formulário.',
      'A sugestão de região só roda quando a pessoa pede e não envia a coordenada.',
      'Contraste alto do sistema operacional continua legível nos cartões e botões.',
    ],
  },
  {
    slug: 'evento-online',
    title: 'Evento online',
    description: 'Evento online publica formato, datas e informações de acesso sem inventar um mapa.',
    paragraphs: [
      'O formato online omite “Como chegar”. O híbrido mostra o local da etapa presencial e explica a parte online na descrição e nas seções.',
      'O link da reunião, do vídeo ao vivo ou da gravação fica na área de quem tem inscrição confirmada. A página pública não mostra esse link e não cria sala de videoconferência.',
    ],
    points: [
      'A inscrição e a área do participante funcionam do mesmo modo no evento online.',
      'A busca pode filtrar o formato online sem misturar com uma região presencial.',
    ],
  },
] as const;

export function publicHelpArticle(slug: string): PublicHelpArticle | undefined {
  return PUBLIC_HELP_ARTICLES.find((article) => article.slug === slug);
}
