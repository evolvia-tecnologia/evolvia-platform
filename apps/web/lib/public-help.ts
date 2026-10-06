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
    description: 'O certificado de participação sai de graça para quem teve a presença registrada, quando a organização libera.',
    paragraphs: [
      'A organização liga o certificado de participação e, se quiser, informa a carga horária. Quem tem inscrição confirmada e entrada registrada emite o próprio certificado na área do participante. O download não é cobrado.',
      'O documento é uma página para imprimir, com um código de autenticidade. Quem tem o código confere o nome publicado, o evento, a carga horária e a data. A consulta não mostra e-mail, CPF nem protocolo.',
      'Não há envio em massa, verso, pacote nem certificado por atividade, autoria ou avaliação nesta versão.',
    ],
    points: [
      'Sem presença registrada, o certificado não é emitido.',
      'A carga horária fica gravada no momento da emissão.',
      'A EVA orienta na tela e não lê documento nem envia dado para fora da Evolvia.',
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
      'O autor envia o trabalho a partir da área do participante, depois da inscrição confirmada. O organizador define se basta quem envia a inscrição ou se o trabalho pede mais autores, e se pede ordem e instituição. Os coautores entram no mesmo envio quando o evento pede.',
      'O avaliador recebe um link da organização e preenche conflito, nota e parecer na própria área. A comissão registra a decisão. Quando o evento pede ePoster, o PDF entra depois do aceite. Os trabalhos aprovados podem ir para a estação científica, no link que o organizador coloca no totem.',
      'Evento corporativo, show ou treinamento não é obrigado a abrir submissão. A Evolvia esconde essa etapa quando ela não faz parte do perfil.',
    ],
    points: [
      'Quem envia usa o nome da inscrição. O coautor não ganha senha nem conta só por constar no trabalho.',
      'O link do avaliador aparece uma vez e não fica gravado como senha.',
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
