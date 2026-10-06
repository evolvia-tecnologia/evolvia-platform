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
  | 'financial';

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
      { question: 'Meus dados saem da plataforma?', answer: 'Não. A busca fica no totem deste evento. A EVA não envia o que você digitou para fora do Evolvia.' },
    ],
  },
  desk: {
    context: 'Posto do operador',
    intro: 'Posso orientar busca, leitor, inscrição no posto e totem. Não consulto a lista de pessoas e não repito documento ou pagamento.',
    questions: [
      { question: 'Como encontro uma inscrição?', answer: 'Use Buscar com os dados que o posto pede, ou o Leitor para a credencial. O resultado fica na tela do posto, não nesta ajuda.' },
      { question: 'Como ligo o totem?', answer: 'Quem organiza e tem permissão de credencial escolhe CPF, e-mail, QR ou número de inscrição e salva. O link do totem tem validade e abre só o autoatendimento deste evento.' },
      { question: 'Você mostra o documento do participante?', answer: 'Não. A EVA não lê e-mail, documento, pagamento nem a ficha. Essas informações ficam só na operação autorizada.' },
    ],
  },
  registrations: {
    context: 'Inscrições recebidas',
    intro: 'Posso explicar os filtros desta lista. Não exporto nomes, protocolos ou pagamentos e não abro a ficha de ninguém.',
    questions: [
      { question: 'Como filtro a lista?', answer: 'Escolha a situação ou busque o protocolo exato. Atualizar recarrega a página atual, sem criar outro arquivo.' },
      { question: 'O que as situações significam?', answer: 'Confirmada já tem vaga. Aguardando pagamento ainda depende do checkout. Expirada e cancelada não entram no evento.' },
      { question: 'Você exporta esta lista?', answer: 'Não. A EVA não copia a tabela, não gera planilha e não envia dados de inscritos para fora da plataforma.' },
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
      { question: 'Você revela dados do evento?', answer: 'Não. A EVA não busca trabalhos, inscrições ou a lista da comissão. O que não está nesta página não entra na resposta.' },
    ],
  },
  access: {
    context: 'Escolha de área',
    intro: 'Posso ajudar a escolher entre participar e organizar. Não peço senha e não listo organizações ou inscrições além do que esta tela já mostrou.',
    questions: [
      { question: 'Qual área eu uso?', answer: 'Participante reúne inscrições, credencial e trabalhos. Organizador cria e opera eventos. A mesma conta pode ter as duas funções.' },
      { question: 'Não apareceu minha organização?', answer: 'Se a consulta falhou, tente de novo nesta tela. A EVA não cria organização nem altera o vínculo por conta própria.' },
      { question: 'Você pede minha senha?', answer: 'Não. Senha, código de confirmação e documento ficam nos formulários oficiais. Não os escreva nesta ajuda.' },
    ],
  },
  financial: {
    context: 'Responsável financeiro',
    intro: 'Posso explicar quem responde pela venda deste evento. Não leio CPF, CNPJ nem documento fiscal e não emito nota.',
    questions: [
      { question: 'O que eu confirmo aqui?', answer: 'A pessoa física ou jurídica da organização que vende a inscrição deste evento. A confirmação usa a versão já cadastrada dos dados da organização.' },
      { question: 'Você repete o documento?', answer: 'Não. O número mascarado fica só na tela de configuração. A EVA não copia, completa nem envia CPF ou CNPJ.' },
      { question: 'Esta tela emite nota?', answer: 'Não. Ela guarda o responsável. A emissão fiscal depende de integração e homologação próprias, em outra etapa.' },
    ],
  },
};
