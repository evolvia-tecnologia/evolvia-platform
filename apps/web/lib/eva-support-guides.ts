import type { EvaHelpQuestion } from '../components/scientific-eva-help';

export type EvaSupportGuideId =
  | 'participant'
  | 'registration'
  | 'kiosk'
  | 'desk'
  | 'registrations'
  | 'help'
  | 'invitation'
  | 'access'
  | 'financial'
  | 'exhibitor'
  | 'overview'
  | 'communication'
  | 'exhibitorCentral'
  | 'caex'
  | 'reports';

type EvaSupportGuide = {
  context: string;
  intro: string;
  questions: EvaHelpQuestion[];
};

const keptHere = 'A resposta fica nesta tela. A EVA não copia documento, senha, protocolo, pagamento ou lista de pessoas para outro lugar.';

export const EVA_SUPPORT_GUIDES: Record<EvaSupportGuideId, EvaSupportGuide> = {
  participant: {
    context: 'Área do participante',
    intro: 'Posso explicar como entrar, acompanhar a inscrição, usar a credencial e enviar um trabalho, sem olhar os dados de outra pessoa.',
    questions: [
      { question: 'Como entro na minha inscrição?', answer: 'Na conta, abra o evento. Sem a conta, use o código da inscrição e o mesmo documento informado na ficha. A senha da conta não é pedida nesta conversa.' },
      { question: 'Onde fica a credencial?', answer: 'Depois da inscrição confirmada, o QR aparece nesta área. Ele vale só para este evento e deve ser mostrado à equipe ou ao totem.' },
      { question: 'Posso corrigir um trabalho?', answer: 'Se o evento científico permitir correção, o botão fica no próprio trabalho. A versão anterior e os pareceres dela permanecem. A nova versão volta para submissão.' },
      { question: 'Você vê meu documento ou pagamento?', answer: keptHere },
    ],
  },
  registration: {
    context: 'Inscrição pública',
    intro: 'Posso orientar a reserva, o protocolo e o pagamento. O valor final é calculado no servidor, não nesta conversa.',
    questions: [
      { question: 'Como reservo uma vaga?', answer: 'Escolha categoria e lote, preencha a ficha deste evento e confirme. Reenviar o formulário não cria outra reserva.' },
      { question: 'Onde eu pago?', answer: 'Se a vaga for paga, o botão abre o checkout seguro. A EVA não pede cartão, senha nem dados do pagador.' },
      { question: 'Para que serve o protocolo?', answer: 'Ele identifica a sua reserva neste evento. Guarde-o para acompanhar a inscrição. A EVA não repete o protocolo de outra pessoa.' },
      { question: 'Você guarda o que eu digitei?', answer: keptHere },
    ],
  },
  kiosk: {
    context: 'Totem de autoatendimento',
    intro: 'Posso explicar como imprimir a etiqueta neste totem. A identificação continua no teclado ou no leitor, não nesta conversa.',
    questions: [
      { question: 'Como imprimo a etiqueta?', answer: 'Use somente a forma ligada neste evento: CPF, e-mail, número de inscrição ou QR. Se a inscrição for encontrada, a etiqueta aparece para impressão.' },
      { question: 'E se eu errar o dado?', answer: 'Apague e tente de novo. A EVA não completa documento, e-mail ou código por você.' },
      { question: 'Meus dados saem da plataforma?', answer: keptHere },
    ],
  },
  desk: {
    context: 'Posto do operador',
    intro: 'Posso orientar busca, leitor, inscrição no posto e totem. Não consulto a lista de pessoas e não repito documento ou pagamento.',
    questions: [
      { question: 'Como encontro uma inscrição?', answer: 'Use Buscar com os dados que o posto pede, ou o Leitor para a credencial. O resultado fica na tela do posto, não nesta ajuda.' },
      { question: 'Como ligo o totem?', answer: 'Quem organiza e tem permissão de credencial escolhe CPF, e-mail, QR ou número de inscrição e salva. O link do totem tem validade e abre só o autoatendimento deste evento.' },
      { question: 'Você mostra o documento do participante?', answer: keptHere },
    ],
  },
  registrations: {
    context: 'Inscrições recebidas',
    intro: 'Posso explicar os filtros desta lista. Não exporto nomes, protocolos ou pagamentos e não abro a ficha de ninguém.',
    questions: [
      { question: 'Como filtro a lista?', answer: 'Escolha a situação ou busque o protocolo exato. Atualizar recarrega a página atual, sem criar outro arquivo.' },
      { question: 'O que as situações significam?', answer: 'Confirmada já tem vaga. Aguardando pagamento ainda depende do checkout. Expirada e cancelada não entram no evento.' },
      { question: 'Você exporta esta lista?', answer: keptHere },
    ],
  },
  help: {
    context: 'Ajuda da plataforma',
    intro: 'Posso indicar o caminho geral de inscrição, credencial, programação e trabalhos. Não consulto um evento específico nem a conta de ninguém.',
    questions: [
      { question: 'Para quem é esta ajuda?', answer: 'Para qualquer pessoa: visitante, participante, convidado, operador ou organizador. O que cada um pode fazer depende do acesso da própria conta.' },
      { question: 'Você responde sobre o meu evento?', answer: 'Aqui, não. Abra a página do evento, a inscrição ou o painel correspondente. A EVA usa só o que essa tela já mostra para você.' },
      { question: 'Onde falo com a organização?', answer: 'Use o contato publicado na página do evento, quando existir. A EVA não inventa telefone, e-mail ou canal.' },
    ],
  },
  invitation: {
    context: 'Convite científico',
    intro: 'Posso explicar este convite. Não mostro a programação interna, outros convidados nem dados que não estejam nesta página.',
    questions: [
      { question: 'O que eu preciso fazer?', answer: 'Leia o convite e confirme ou recuse. A resposta fica registrada neste link. Não é necessário criar outra conta só para responder.' },
      { question: 'O link é seguro?', answer: 'Ele identifica só este convite. Não compartilhe o endereço se não quiser que outra pessoa responda no seu lugar.' },
      { question: 'Você revela dados do evento?', answer: keptHere },
    ],
  },
  access: {
    context: 'Escolha de área',
    intro: 'Posso ajudar a escolher entre participar e organizar. Não peço senha e não listo organizações ou inscrições além do que esta tela já mostrou.',
    questions: [
      { question: 'Qual área eu uso?', answer: 'Participante reúne inscrições, credencial e trabalhos. Organizador cria e opera eventos. A mesma conta pode ter as duas funções.' },
      { question: 'Não apareceu minha organização?', answer: 'Se a consulta falhou, tente de novo nesta tela. A EVA não cria organização nem altera o vínculo por conta própria.' },
      { question: 'Você pede minha senha?', answer: keptHere },
    ],
  },
  financial: {
    context: 'Responsável financeiro',
    intro: 'Posso explicar quem responde pela venda deste evento. Não leio CPF, CNPJ nem documento fiscal e não emito nota.',
    questions: [
      { question: 'O que eu confirmo aqui?', answer: 'A pessoa física ou jurídica da organização que vende a inscrição deste evento. A confirmação usa a versão já cadastrada dos dados da organização.' },
      { question: 'Você repete o documento?', answer: keptHere },
      { question: 'Esta tela emite nota?', answer: 'Não. Ela guarda o responsável. A emissão fiscal depende de integração e homologação próprias, em outra etapa.' },
    ],
  },
  exhibitor: {
    context: 'Área da empresa expositora',
    intro: 'Posso orientar dados cadastrais, representantes, formulários, pagamentos e downloads desta empresa. Não mostro outra empresa e não peço senha compartilhada.',
    questions: [
      { question: 'Como a empresa entra?', answer: 'Com a conta Evolvia do e-mail que a organização cadastrou, depois de confirmar esse e-mail. Representante entra com a conta do próprio e-mail cadastrado.' },
      { question: 'Onde envio credencial e pedido?', answer: 'Na aba Formulários. O prazo e a cota vêm da organização. Fora do prazo, o formulário continua visível e não aceita novo envio.' },
      { question: 'Esta área emite boleto?', answer: 'Não. Os valores solicitados aparecem em Pagamentos. A confirmação fica com a organização. Não peça cartão nem senha nesta conversa.' },
      { question: 'Você mostra o documento de outra empresa?', answer: keptHere },
    ],
  },
  overview: {
    context: 'Visão geral do evento',
    intro: 'Posso indicar o que esta visão geral organiza. Não publico o evento, não abro inscrição e não leio a lista de participantes.',
    questions: [
      { question: 'Por onde eu começo?', answer: 'Use os cartões desta tela para divulgação, inscrições, credenciamento e os recursos que o evento já tem ligados. O menu lateral repete esses caminhos.' },
      { question: 'Esta tela publica o evento?', answer: 'Não. A visão geral só orienta. A página pública e a abertura das inscrições continuam em etapas próprias, com confirmação.' },
      { question: 'Você mostra quem está inscrito?', answer: keptHere },
    ],
  },
  communication: {
    context: 'Mensagens do evento',
    intro: 'Posso explicar o rascunho desta tela. Salvar não envia e-mail e eu não leio a lista de destinatários.',
    questions: [
      { question: 'Salvar envia a mensagem?', answer: 'Não. O botão guarda o rascunho neste evento. O envio automático ainda não está disponível nesta tela.' },
      { question: 'Posso abrir outro rascunho?', answer: 'Se houver alteração não salva, salve ou descarte antes. A versão anterior do rascunho permanece até você gravar de novo.' },
      { question: 'Você envia esta mensagem para alguém?', answer: keptHere },
    ],
  },
  exhibitorCentral: {
    context: 'Central do expositor',
    intro: 'Posso orientar empresas, cotas, credenciais, formulários e pedidos deste evento. Não mostro o documento de uma empresa e não entro na conta dela.',
    questions: [
      { question: 'O que eu cadastro aqui?', answer: 'A empresa expositora ou prestadora, a cota de crachás e os formulários que ela vai preencher. A empresa entra depois com a própria conta.' },
      { question: 'A cota impede um crachá a mais?', answer: 'Sim. A cota desta tela limita o que a empresa pode pedir. O credenciamento no CAEX não aumenta a cota sozinho.' },
      { question: 'Você abre a senha da empresa?', answer: keptHere },
    ],
  },
  caex: {
    context: 'CAEX',
    intro: 'Posso explicar o atendimento de expositor e prestador. Não imprimo crachá daqui e não mostro documento completo.',
    questions: [
      { question: 'Para que serve o CAEX?', answer: 'Para localizar a empresa, conferir credenciais e registrar atendimento deste evento. A ficha da empresa continua na central do expositor.' },
      { question: 'Como acho uma empresa?', answer: 'Use a busca e o tipo de credencial desta tela. O resultado fica na lista, não nesta conversa.' },
      { question: 'Você revela o documento do crachá?', answer: keptHere },
    ],
  },
  reports: {
    context: 'Relatórios do evento',
    intro: 'Posso explicar o que estes números representam. Não exporto nomes, protocolos ou pagamentos por esta conversa.',
    questions: [
      { question: 'Os números são a lista de pessoas?', answer: 'Não. São contagens e valores agregados deste evento. A exportação disponível na tela segue o relatório selecionado, sem abrir ficha individual aqui.' },
      { question: 'O valor recebido é o caixa do evento?', answer: 'Não. Ele mostra pagamentos confirmados no checkout. Não inclui caixa presencial, estorno nem nota fiscal.' },
      { question: 'Você envia este relatório para fora?', answer: keptHere },
    ],
  },
};
