export type KioskLanguage = 'pt' | 'es' | 'en';

const COPY = {
  pt: {
    language: 'Idioma',
    selfService: 'AUTOATENDIMENTO',
    documentTitle: 'Insira o nome de seu documento, CPF ou Passaporte.',
    documentHint: 'Só números: CPF de 11 dígitos. Letras e números: passaporte.',
    documentLabel: 'CPF ou passaporte',
    shortDocument: 'O passaporte precisa ter de 5 a 40 letras ou números.',
    invalidCpf: 'Informe um CPF válido de 11 números.',
    emailTitle: 'Insira seu e-mail.',
    emailLabel: 'E-mail',
    protocolTitle: 'Digite o número da inscrição deste evento.',
    protocolLabel: 'Número de inscrição',
    qrTitle: 'Apresente seu QR Code para leitura.',
    qrHint: 'O mesmo campo também lê o código de barras da etiqueta.',
    qrLabel: 'QR Code',
    welcome: 'BEM-VINDO(A)',
    confirm: 'Confirme se suas informações estão corretas. Caso contrário, clique no botão Sair e solicite ajuda a um atendente.',
    name: 'Nome',
    company: 'Empresa',
    already: 'Sua entrada já estava registrada. A etiqueta pode ser impressa de novo.',
    success: 'Sucesso!',
    checkedIn: 'Check-in realizado com sucesso!',
    thanks: 'Agradecemos sua participação e desejamos um ótimo evento!',
    leave: 'Sair',
    print: 'Imprimir',
    printAgain: 'Imprimir de novo',
    send: 'Enviar',
    clear: 'Limpar',
    backspace: 'Apagar',
    unavailable: 'Autoatendimento indisponível neste evento.',
    opening: 'Abrindo o totem…',
    noMethods: 'As formas de identificação ainda não foram habilitadas.',
    notFound: 'Não encontramos uma inscrição confirmada com esses dados.',
    printFailed: 'Não foi possível imprimir a etiqueta.',
    invalidLink: 'Este link de autoatendimento não é válido.',
    methodCpf: 'CPF ou passaporte',
    methodEmail: 'E-mail',
    methodQr: 'QR Code',
    methodProtocol: 'Número de inscrição',
  },
  es: {
    language: 'Idioma',
    selfService: 'AUTOSERVICIO',
    documentTitle: 'Escriba el nombre de su documento, CPF o pasaporte.',
    documentHint: 'Solo números: CPF de 11 dígitos. Letras y números: pasaporte.',
    documentLabel: 'CPF o pasaporte',
    shortDocument: 'El pasaporte debe tener de 5 a 40 letras o números.',
    invalidCpf: 'Informe un CPF válido de 11 números.',
    emailTitle: 'Escriba su correo.',
    emailLabel: 'Correo',
    protocolTitle: 'Escriba el número de inscripción de este evento.',
    protocolLabel: 'Número de inscripción',
    qrTitle: 'Presente su código QR para la lectura.',
    qrHint: 'El mismo campo también lee el código de barras de la etiqueta.',
    qrLabel: 'Código QR',
    welcome: 'BIENVENIDO(A)',
    confirm: 'Confirme si sus datos están correctos. Si no, pulse Salir y pida ayuda a un asistente.',
    name: 'Nombre',
    company: 'Empresa',
    already: 'Su entrada ya estaba registrada. La etiqueta se puede imprimir de nuevo.',
    success: '¡Listo!',
    checkedIn: '¡El check-in se realizó con éxito!',
    thanks: 'Gracias por participar. Le deseamos un excelente evento.',
    leave: 'Salir',
    print: 'Imprimir',
    printAgain: 'Imprimir de nuevo',
    send: 'Enviar',
    clear: 'Borrar',
    backspace: 'Borrar uno',
    unavailable: 'El autoservicio no está disponible en este evento.',
    opening: 'Abriendo el tótem…',
    noMethods: 'Las formas de identificación todavía no fueron habilitadas.',
    notFound: 'No encontramos una inscripción confirmada con esos datos.',
    printFailed: 'No fue posible imprimir la etiqueta.',
    invalidLink: 'Este enlace de autoservicio no es válido.',
    methodCpf: 'CPF o pasaporte',
    methodEmail: 'Correo',
    methodQr: 'Código QR',
    methodProtocol: 'Número de inscripción',
  },
  en: {
    language: 'Language',
    selfService: 'SELF-SERVICE',
    documentTitle: 'Enter your document name, CPF or passport.',
    documentHint: 'Numbers only: an 11-digit CPF. Letters and numbers: a passport.',
    documentLabel: 'CPF or passport',
    shortDocument: 'The passport must have 5 to 40 letters or numbers.',
    invalidCpf: 'Enter a valid 11-digit CPF.',
    emailTitle: 'Enter your email.',
    emailLabel: 'Email',
    protocolTitle: 'Enter the registration number for this event.',
    protocolLabel: 'Registration number',
    qrTitle: 'Present your QR code to be read.',
    qrHint: 'The same field also reads the barcode on the badge.',
    qrLabel: 'QR code',
    welcome: 'WELCOME',
    confirm: 'Check that your details are correct. Otherwise, choose Leave and ask an attendant for help.',
    name: 'Name',
    company: 'Company',
    already: 'Your entry was already recorded. The badge can be printed again.',
    success: 'Success!',
    checkedIn: 'Check-in completed.',
    thanks: 'Thank you for joining us. We hope you enjoy the event.',
    leave: 'Leave',
    print: 'Print',
    printAgain: 'Print again',
    send: 'Send',
    clear: 'Clear',
    backspace: 'Delete',
    unavailable: 'Self-service is unavailable for this event.',
    opening: 'Opening the kiosk…',
    noMethods: 'The identification methods have not been enabled yet.',
    notFound: 'We could not find a confirmed registration with these details.',
    printFailed: 'The badge could not be printed.',
    invalidLink: 'This self-service link is not valid.',
    methodCpf: 'CPF or passport',
    methodEmail: 'Email',
    methodQr: 'QR code',
    methodProtocol: 'Registration number',
  },
} as const;

export type KioskCopy = (typeof COPY)[KioskLanguage];

export function kioskLanguage(value: string | null | undefined): KioskLanguage {
  if (value === 'es' || value === 'en') return value;
  return 'pt';
}

export function kioskCopy(language: KioskLanguage): KioskCopy {
  return COPY[language];
}

function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/u.test(value) || /^(\d)\1{10}$/u.test(value)) return false;
  return [9, 10].every((size) => {
    const sum = Array.from(value.slice(0, size)).reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return Number(value[size]) === (remainder === 10 ? 0 : remainder);
  });
}

export function interpretKioskDocument(raw: string): { ok: true; value: string } | { ok: false; error: 'empty' | 'short' | 'cpf' } {
  const document = raw.trim().toUpperCase().replace(/[^A-Z0-9]/gu, '');
  if (!document) return { ok: false, error: 'empty' };
  if (/^\d+$/u.test(document)) {
    if (!isValidCpf(document)) return { ok: false, error: 'cpf' };
    return { ok: true, value: document };
  }
  if (document.length < 5 || document.length > 40) return { ok: false, error: 'short' };
  return { ok: true, value: document };
}
